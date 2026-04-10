from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.db import transaction, models, IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission
from accounts.models import User
from core.pagination import StandardLimitOffsetPagination
from sales.models import CustomerOrder
from .models import DeliveryRun, DeliveryLocationPing


ACTIVE_STATUSES = {"assigned", "picked_up", "en_route", "arrived"}
TERMINAL_STATUSES = {"delivered", "failed", "cancelled"}

STATUS_TRANSITIONS = {
    "assigned": {"picked_up", "en_route"},
    "picked_up": {"en_route", "arrived"},
    "en_route": {"arrived", "delivered", "failed"},
    "arrived": {"delivered", "failed"},
}


def _role(user):
    return (getattr(user, "role", "") or "").strip().lower()


def _is_admin(user):
    return getattr(user, "is_superuser", False) or _role(user) in ("admin", "supervisor")


def _parse_decimal(value, *, field):
    if value is None or str(value).strip() == "":
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"Invalid {field}")


def _parse_datetime(value, *, field):
    if value is None or str(value).strip() == "":
        return None
    try:
        return datetime.fromisoformat(str(value).strip())
    except (ValueError, TypeError):
        raise ValueError(f"Invalid {field}. Use ISO format.")


def _serialize_run(run):
    order = run.order
    sale = getattr(order, "sale", None)
    customer = getattr(sale, "customer", None)
    delivery_person = run.delivery_person
    return {
        "id": str(run.id),
        "status": run.status,
        "assigned_at": run.assigned_at.isoformat() if run.assigned_at else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "failed_at": run.failed_at.isoformat() if run.failed_at else None,
        "start_latitude": str(run.start_latitude) if run.start_latitude is not None else None,
        "start_longitude": str(run.start_longitude) if run.start_longitude is not None else None,
        "end_latitude": str(run.end_latitude) if run.end_latitude is not None else None,
        "end_longitude": str(run.end_longitude) if run.end_longitude is not None else None,
        "last_known_latitude": str(run.last_known_latitude) if run.last_known_latitude is not None else None,
        "last_known_longitude": str(run.last_known_longitude) if run.last_known_longitude is not None else None,
        "last_ping_at": run.last_ping_at.isoformat() if run.last_ping_at else None,
        "notes": run.notes,
        "recipient_name": run.recipient_name or None,
        "recipient_phone": run.recipient_phone or None,
        "delivery_notes": run.delivery_notes or None,
        "delivered_at": run.delivered_at.isoformat() if run.delivered_at else None,
        "delivery_person": {
            "id": str(delivery_person.id) if delivery_person else None,
            "name": f"{delivery_person.first_name} {delivery_person.last_name}".strip() if delivery_person else None,
            "username": delivery_person.username if delivery_person else None,
            "role": _role(delivery_person) if delivery_person else None,
        },
        "branch": {
            "id": str(run.branch_id),
            "name": run.branch.branch_name if run.branch else None,
        },
        "order": {
            "id": str(order.id),
            "status": order.status,
            "sale_id": str(sale.id) if sale else None,
            "customer_id": str(customer.id) if customer else None,
            "customer_name": customer.name if customer else None,
        },
    }


def _serialize_ping(ping):
    return {
        "id": str(ping.id),
        "latitude": str(ping.latitude),
        "longitude": str(ping.longitude),
        "accuracy_meters": str(ping.accuracy_meters) if ping.accuracy_meters is not None else None,
        "speed_kph": str(ping.speed_kph) if ping.speed_kph is not None else None,
        "heading_degrees": str(ping.heading_degrees) if ping.heading_degrees is not None else None,
        "battery_level": str(ping.battery_level) if ping.battery_level is not None else None,
        "recorded_at": ping.recorded_at.isoformat() if ping.recorded_at else None,
        "delivery_person_id": str(ping.delivery_person_id) if ping.delivery_person_id else None,
    }


def _ensure_run_access(request, run):
    if _is_admin(request.user):
        return True
    return run.delivery_person_id == request.user.id


def _sync_order_status_from_delivery_run(run, *, outcome):
    """
    Conservative order status sync for terminal run outcomes.
    Only updates when the order is in a safe pre-delivery state.
    """
    if outcome not in {"delivered", "failed"}:
        return False
    if not run.order_id:
        return False

    order = CustomerOrder.objects.select_for_update().filter(id=run.order_id).first()
    if not order:
        return False

    if outcome == "delivered":
        if order.status == "out_for_delivery":
            order.status = "delivered"
            order.save(update_fields=["status", "updated_at"])
            return True
        return False

    # No safe failure status exists for CustomerOrder yet.
    return False


class DeliveryRunListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        status = (request.query_params.get("status") or "").strip().lower()
        branch_id = request.query_params.get("branch")
        delivery_person_id = request.query_params.get("delivery_person")
        active_only = request.query_params.get("active") == "1"

        qs = DeliveryRun.objects.select_related("order", "order__sale", "order__sale__customer", "delivery_person", "branch")

        if not _is_admin(request.user):
            qs = qs.filter(delivery_person=request.user)
        elif delivery_person_id:
            qs = qs.filter(delivery_person_id=delivery_person_id)

        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if status:
            qs = qs.filter(status=status)
        if active_only:
            qs = qs.filter(status__in=ACTIVE_STATUSES)
        if query:
            qs = qs.filter(
                models.Q(order__id__icontains=query)
                | models.Q(order__sale__id__icontains=query)
                | models.Q(order__sale__customer__name__icontains=query)
            )

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs

        data = [_serialize_run(run) for run in page]
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class DeliveryRunCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def post(self, request):
        data = request.data or {}
        order_id = data.get("order_id") or data.get("order")
        if not order_id:
            return Response({"order": "Order is required."}, status=400)
        delivery_person_id = data.get("delivery_person_id") or data.get("delivery_person")

        order = get_object_or_404(CustomerOrder.objects.select_related("sale", "sale__customer"), id=order_id)
        if order.status in ("cancelled", "delivered"):
            return Response({"detail": "Cannot create a run for a cancelled or delivered order."}, status=400)

        sale = order.sale
        if not sale or not sale.assigned_to_id:
            return Response(
                {"detail": "Assign a delivery person to the order before creating a delivery run."},
                status=400,
            )

        delivery_person = sale.assigned_to
        if delivery_person.role != "deliver_person" or not delivery_person.is_active:
            return Response({"detail": "Assigned delivery person is not available."}, status=400)
        if delivery_person_id and str(delivery_person.id) != str(delivery_person_id):
            return Response(
                {"detail": "Delivery run must use the delivery person already assigned to this order."},
                status=400,
            )

        with transaction.atomic():
            try:
                run = DeliveryRun.objects.create(
                    order=order,
                    delivery_person=delivery_person,
                    branch=sale.branch,
                    status="assigned",
                    notes=str(data.get("notes") or "").strip(),
                )
            except IntegrityError:
                return Response({"detail": "A delivery run already exists for this order."}, status=400)

        return Response({"id": str(run.id)}, status=201)


class DeliveryRunDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def get(self, request, run_id):
        run = get_object_or_404(
            DeliveryRun.objects.select_related("order", "order__sale", "order__sale__customer", "delivery_person", "branch"),
            id=run_id,
        )
        if not _ensure_run_access(request, run):
            return Response({"detail": "Not permitted to view this run."}, status=403)
        return Response(_serialize_run(run))

    def put(self, request, run_id):
        run = get_object_or_404(DeliveryRun.objects.select_related("delivery_person"), id=run_id)
        if not _is_admin(request.user):
            return Response({"detail": "Not permitted to update this run."}, status=403)
        if run.status in TERMINAL_STATUSES:
            return Response({"detail": "Cannot update a completed run."}, status=400)
        data = request.data or {}
        run.notes = str(data.get("notes") or "").strip()
        run.save(update_fields=["notes", "updated_at"])
        return Response({"id": str(run.id)}, status=200)


class DeliveryRunHistoryView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def get(self, request, run_id):
        run = get_object_or_404(DeliveryRun, id=run_id)
        if not _ensure_run_access(request, run):
            return Response({"detail": "Not permitted to view this run."}, status=403)
        pings = run.pings.select_related("delivery_person").order_by("-recorded_at")
        data = [_serialize_ping(ping) for ping in pings]
        return Response(data)


class DeliveryRunCancelView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def post(self, request, run_id):
        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if run.status in TERMINAL_STATUSES:
                return Response({"detail": "Run is already completed."}, status=400)
            run.status = "cancelled"
            run.save(update_fields=["status", "updated_at"])
        return Response({"id": str(run.id), "status": run.status}, status=200)


class DeliveryRunStartView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def post(self, request, run_id):
        data = request.data or {}
        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if not _ensure_run_access(request, run):
                return Response({"detail": "Not permitted to start this run."}, status=403)
            if run.status != "assigned":
                return Response({"detail": "Run has already been started."}, status=400)

            next_status = (data.get("status") or "picked_up").strip().lower()
            if next_status not in STATUS_TRANSITIONS["assigned"]:
                return Response({"status": "Invalid start status."}, status=400)

            try:
                lat = _parse_decimal(data.get("latitude"), field="latitude")
                lng = _parse_decimal(data.get("longitude"), field="longitude")
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)

            run.started_at = run.started_at or timezone.now()
            run.status = next_status
            if lat is not None and lng is not None:
                run.start_latitude = lat
                run.start_longitude = lng
                run.last_known_latitude = lat
                run.last_known_longitude = lng
                run.last_ping_at = timezone.now()
            run.save()
        return Response({"id": str(run.id), "status": run.status}, status=200)


class DeliveryRunStatusView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def post(self, request, run_id):
        data = request.data or {}
        next_status = (data.get("status") or "").strip().lower()
        if not next_status:
            return Response({"status": "Status is required."}, status=400)

        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if not _ensure_run_access(request, run):
                return Response({"detail": "Not permitted to update this run."}, status=403)
            current = run.status
            if current in TERMINAL_STATUSES:
                return Response({"detail": "Run is already completed."}, status=400)
            allowed = STATUS_TRANSITIONS.get(current, set())
            if next_status not in allowed:
                return Response({"status": f"Cannot move run from {current} to {next_status}."}, status=400)
            if next_status == "delivered":
                return Response({"detail": "Use Complete Delivery to record proof of delivery."}, status=400)

            run.status = next_status
            if next_status == "delivered":
                run.completed_at = timezone.now()
            if next_status == "failed":
                run.failed_at = timezone.now()
            run.save()
        return Response({"id": str(run.id), "status": run.status}, status=200)


class DeliveryRunLocationView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def post(self, request, run_id):
        data = request.data or {}
        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if not _ensure_run_access(request, run):
                return Response({"detail": "Not permitted to post location."}, status=403)
            if run.status not in ACTIVE_STATUSES:
                return Response({"detail": "Cannot post location for this run status."}, status=400)

            try:
                lat = _parse_decimal(data.get("latitude"), field="latitude")
                lng = _parse_decimal(data.get("longitude"), field="longitude")
                accuracy = _parse_decimal(data.get("accuracy_meters"), field="accuracy_meters")
                speed = _parse_decimal(data.get("speed_kph"), field="speed_kph")
                heading = _parse_decimal(data.get("heading_degrees"), field="heading_degrees")
                battery = _parse_decimal(data.get("battery_level"), field="battery_level")
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)

            if lat is None or lng is None:
                return Response({"detail": "Latitude and longitude are required."}, status=400)

            try:
                recorded_at = _parse_datetime(data.get("recorded_at"), field="recorded_at") or timezone.now()
            except ValueError as exc:
                return Response({"recorded_at": str(exc)}, status=400)

            ping = DeliveryLocationPing.objects.create(
                delivery_run=run,
                delivery_person=request.user if request.user.is_authenticated else None,
                latitude=lat,
                longitude=lng,
                accuracy_meters=accuracy,
                speed_kph=speed,
                heading_degrees=heading,
                battery_level=battery,
                recorded_at=recorded_at,
            )

            run.last_known_latitude = lat
            run.last_known_longitude = lng
            run.last_ping_at = recorded_at
            run.save(update_fields=["last_known_latitude", "last_known_longitude", "last_ping_at", "updated_at"])

        return Response({"id": str(ping.id)}, status=201)


class DeliveryRunCompleteView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def post(self, request, run_id):
        data = request.data or {}
        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if not _ensure_run_access(request, run):
                return Response({"detail": "Not permitted to complete this run."}, status=403)
            if run.status in TERMINAL_STATUSES:
                return Response({"detail": "Run is already completed."}, status=400)

            recipient_name = str(data.get("recipient_name") or "").strip()
            if not recipient_name:
                return Response({"recipient_name": "Recipient name is required."}, status=400)

            try:
                lat = _parse_decimal(data.get("latitude"), field="latitude")
                lng = _parse_decimal(data.get("longitude"), field="longitude")
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)

            run.status = "delivered"
            run.completed_at = timezone.now()
            run.delivered_at = run.delivered_at or run.completed_at
            run.recipient_name = recipient_name
            run.recipient_phone = str(data.get("recipient_phone") or "").strip()
            run.delivery_notes = str(data.get("delivery_notes") or "").strip()
            if lat is not None and lng is not None:
                run.end_latitude = lat
                run.end_longitude = lng
                run.last_known_latitude = lat
                run.last_known_longitude = lng
                run.last_ping_at = timezone.now()
            run.save()
            _sync_order_status_from_delivery_run(run, outcome="delivered")
        return Response({"id": str(run.id), "status": run.status}, status=200)


class DeliveryRunFailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person"}

    def post(self, request, run_id):
        data = request.data or {}
        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if not _ensure_run_access(request, run):
                return Response({"detail": "Not permitted to fail this run."}, status=403)
            if run.status in TERMINAL_STATUSES:
                return Response({"detail": "Run is already completed."}, status=400)

            try:
                lat = _parse_decimal(data.get("latitude"), field="latitude")
                lng = _parse_decimal(data.get("longitude"), field="longitude")
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)

            run.status = "failed"
            run.failed_at = timezone.now()
            if lat is not None and lng is not None:
                run.end_latitude = lat
                run.end_longitude = lng
                run.last_known_latitude = lat
                run.last_known_longitude = lng
                run.last_ping_at = timezone.now()
            run.save()
            _sync_order_status_from_delivery_run(run, outcome="failed")
        return Response({"id": str(run.id), "status": run.status}, status=200)
