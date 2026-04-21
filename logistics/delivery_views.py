from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.db import transaction, models, IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers

from accounts.permissions import RolePermission
from accounts.models import User
from core.pagination import StandardLimitOffsetPagination
from sales.models import CustomerOrder, Sale, SalePayment
from .models import DeliveryRun, DeliveryLocationPing


ACTIVE_STATUSES = {"assigned", "picked_up", "en_route", "arrived"}
TERMINAL_STATUSES = {"delivered", "failed", "cancelled"}
DELIVERY_ROLES = {"deliver_person", "delivery_person"}
DELIVERY_VISIBLE_ORDER_STATUSES = {"confirmed", "processing", "out_for_delivery"}

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


def _delivery_person_payload(user):
    if not user:
        return None
    return {
        "id": str(user.id),
        "name": f"{user.first_name} {user.last_name}".strip() or user.username,
        "username": user.username,
        "role": _role(user),
    }


def _customer_payload(customer):
    if not customer:
        return None
    return {
        "id": str(customer.id),
        "name": customer.name,
    }


def _branch_payload(branch):
    if not branch:
        return None
    return {
        "id": str(branch.id),
        "name": branch.branch_name,
    }


def _payment_payload(payment):
    if not payment:
        return None
    return {
        "id": str(payment.id),
        "amount": str(payment.amount),
        "method": payment.method,
        "collection_stage": getattr(payment, "collection_stage", "") or "",
        "status": payment.status,
        "reference": payment.reference or "",
        "phone_number": payment.phone_number or "",
        "note": payment.note or "",
        "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
        "received_by": _delivery_person_payload(payment.received_by),
        "received_by_name": _delivery_person_payload(payment.received_by)["name"] if payment.received_by else "",
        "delivery_run_id": str(payment.delivery_run_id) if getattr(payment, "delivery_run_id", None) else None,
    }


def _safe_related_one_to_one(obj, attr):
    if not obj:
        return None
    try:
        return getattr(obj, attr)
    except Exception:
        return None


def _sale_payload(sale):
    if not sale:
        return None
    customer = getattr(sale, "customer", None)
    assigned = getattr(sale, "assigned_to", None)
    payments = []
    try:
        delivery_payments = sale.payments.filter(collection_stage="delivery").select_related("received_by", "delivery_run").order_by("-payment_date", "-created_at")
        payments = [_payment_payload(payment) for payment in delivery_payments]
    except Exception:
        payments = []
    return {
        "id": str(sale.id),
        "sale_type": sale.sale_type,
        "status": sale.status,
        "payment_status": sale.payment_status,
        "is_credit_sale": sale.is_credit_sale,
        "total": str(sale.grand_total),
        "amount_paid": str(sale.amount_paid),
        "balance_due": str(sale.balance_due),
        "assigned_to": _delivery_person_payload(assigned),
        "customer": _customer_payload(customer),
        "created_at": sale.completed_at.isoformat() if sale.completed_at else (sale.sale_date.isoformat() if sale.sale_date else None),
        "delivery_payments": payments,
        "delivery_payment_total": str(sum((Decimal(str(p.get("amount") or "0")) for p in payments), Decimal("0.00"))),
    }


def _serialize_run(run):
    order = run.order
    sale = getattr(run, "sale", None) or getattr(order, "sale", None)
    customer = getattr(sale, "customer", None)
    delivery_person = run.delivery_person
    return {
        "id": str(run.id),
        "source_type": "customer_order" if order else "sale",
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
        "delivery_person": _delivery_person_payload(delivery_person),
        "branch": _branch_payload(run.branch),
        "order": {
            "id": str(order.id) if order else None,
            "status": order.status if order else None,
            "sale_id": str(sale.id) if sale else None,
            "customer_id": str(customer.id) if customer else None,
            "customer_name": customer.name if customer else None,
        } if order else None,
        "sale": _sale_payload(sale),
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


class DeliveryPaymentItemSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=[choice[0] for choice in SalePayment.METHOD_CHOICES])
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class DeliveryRunCompleteSerializer(serializers.Serializer):
    recipient_name = serializers.CharField(max_length=150)
    recipient_phone = serializers.CharField(max_length=50, required=False, allow_blank=True)
    delivery_notes = serializers.CharField(required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False, allow_null=True)
    delivery_payments = DeliveryPaymentItemSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        normalized_payments = []
        total = Decimal("0.00")
        for payment in attrs.get("delivery_payments") or []:
            amount = Decimal(str(payment.get("amount") or "0")).quantize(Decimal("0.01"))
            if amount < 0:
                raise serializers.ValidationError({"delivery_payments": "Delivery payment amounts cannot be negative."})
            if amount <= 0:
                continue
            method = (payment.get("method") or "cash").strip().lower()
            if method not in dict(SalePayment.METHOD_CHOICES):
                raise serializers.ValidationError({"delivery_payments": f"Unsupported payment method: {method}."})
            reference = (payment.get("reference") or "").strip()
            phone_number = (payment.get("phone_number") or "").strip()
            if method == "mpesa":
                if not reference:
                    raise serializers.ValidationError({"delivery_payments": "M-Pesa reference is required for delivery payments."})
                if not phone_number:
                    raise serializers.ValidationError({"delivery_payments": "M-Pesa phone number is required for delivery payments."})
            note = (payment.get("note") or "").strip()
            normalized_payments.append({
                "method": method,
                "amount": amount,
                "reference": reference,
                "phone_number": phone_number,
                "note": note,
            })
            total += amount
        attrs["delivery_payments"] = normalized_payments
        attrs["delivery_payment_total"] = total
        return attrs


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


def _eligible_delivery_sale_qs(request):
    qs = Sale.objects.select_related(
        "branch",
        "customer",
        "customer__route",
        "assigned_to",
    )
    if not _is_admin(request.user):
        qs = qs.filter(assigned_to=request.user)
    return qs.filter(status="completed", assigned_to__role__in=list(DELIVERY_ROLES))


def _serialize_delivery_queue_order(order):
    sale = getattr(order, "sale", None)
    customer = getattr(sale, "customer", None) if sale else None
    assigned = getattr(sale, "assigned_to", None) if sale else None
    existing_run = _safe_related_one_to_one(order, "delivery_run")
    return {
        "id": str(order.id),
        "type": "customer_order",
        "source_type": "customer_order",
        "source_id": str(order.id),
        "order_id": str(order.id),
        "sale_id": str(sale.id) if sale else None,
        "customer": _customer_payload(customer),
        "status": order.status,
        "total": str(sale.grand_total) if sale else None,
        "delivery_person": _delivery_person_payload(assigned),
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "branch": _branch_payload(getattr(sale, "branch", None)),
        "existing_run_id": str(existing_run.id) if existing_run else None,
    }


def _serialize_delivery_queue_sale(sale):
    customer = getattr(sale, "customer", None)
    assigned = getattr(sale, "assigned_to", None)
    existing_run = _safe_related_one_to_one(sale, "delivery_run")
    return {
        "id": str(sale.id),
        "type": "sale",
        "source_type": "sale",
        "source_id": str(sale.id),
        "order_id": None,
        "sale_id": str(sale.id),
        "customer": _customer_payload(customer),
        "status": sale.status,
        "payment_status": sale.payment_status,
        "is_credit_sale": sale.is_credit_sale,
        "total": str(sale.grand_total),
        "delivery_person": _delivery_person_payload(assigned),
        "created_at": sale.completed_at.isoformat() if sale.completed_at else (sale.sale_date.isoformat() if sale.sale_date else None),
        "branch": _branch_payload(sale.branch),
        "existing_run_id": str(existing_run.id) if existing_run else None,
    }


class DeliveryRunListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        status = (request.query_params.get("status") or "").strip().lower()
        branch_id = request.query_params.get("branch")
        delivery_person_id = request.query_params.get("delivery_person")
        active_only = request.query_params.get("active") == "1"

        qs = DeliveryRun.objects.select_related("order", "order__sale", "sale", "sale__customer", "delivery_person", "branch")

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
                | models.Q(sale__id__icontains=query)
                | models.Q(sale__customer__name__icontains=query)
            )
        if request.query_params.get("completed_today") == "1":
            today = timezone.localdate()
            qs = qs.filter(status="delivered", completed_at__date=today)

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs

        data = [_serialize_run(run) for run in page]
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class DeliveryDashboardView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"deliver_person", "delivery_person"}

    def get(self, request):
        today = timezone.localdate()
        branch_id = getattr(request.user, "branch_id", None)

        orders_qs = CustomerOrder.objects.select_related("sale")
        orders_qs = orders_qs.filter(
            sale__assigned_to=request.user,
            status__in=DELIVERY_VISIBLE_ORDER_STATUSES,
        )
        if branch_id:
            orders_qs = orders_qs.filter(sale__branch_id=branch_id)

        runs_qs = DeliveryRun.objects.filter(delivery_person=request.user)
        if branch_id:
            runs_qs = runs_qs.filter(branch_id=branch_id)

        active_deliveries_count = runs_qs.filter(status__in=ACTIVE_STATUSES).count()
        completed_today_count = runs_qs.filter(status="delivered", completed_at__date=today).count()

        return Response(
            {
                "assigned_orders_count": orders_qs.count(),
                "active_deliveries_count": active_deliveries_count,
                "completed_today_count": completed_today_count,
            }
        )


class DeliveryQueueView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        branch_id = request.query_params.get("branch")
        source_type = (request.query_params.get("type") or "").strip().lower()

        orders_qs = CustomerOrder.objects.select_related(
            "sale",
            "sale__branch",
            "sale__customer",
            "sale__assigned_to",
            "sale__customer__route",
            "delivery_run",
        )
        if not _is_admin(request.user):
            orders_qs = orders_qs.filter(sale__assigned_to=request.user)
        orders_qs = orders_qs.exclude(status__in=TERMINAL_STATUSES).filter(
            sale__assigned_to__role__in=list(DELIVERY_ROLES)
        )

        sales_qs = _eligible_delivery_sale_qs(request).prefetch_related()

        if branch_id:
            orders_qs = orders_qs.filter(sale__branch_id=branch_id)
            sales_qs = sales_qs.filter(branch_id=branch_id)
        if query:
            orders_qs = orders_qs.filter(
                models.Q(id__icontains=query)
                | models.Q(sale__id__icontains=query)
                | models.Q(sale__customer__name__icontains=query)
            )
            sales_qs = sales_qs.filter(
                models.Q(id__icontains=query)
                | models.Q(customer__name__icontains=query)
            )

        queue_rows = []
        if source_type in ("", "customer_order"):
            queue_rows.extend(_serialize_delivery_queue_order(order) for order in orders_qs)
        if source_type in ("", "sale"):
            queue_rows.extend(_serialize_delivery_queue_sale(sale) for sale in sales_qs)

        queue_rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(queue_rows, request, view=self)
        page = page if page is not None else queue_rows
        if page is not queue_rows:
            return paginator.get_paginated_response(page)
        return Response(queue_rows)


class DeliveryRunCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

    def post(self, request):
        data = request.data or {}
        source_type = (data.get("source_type") or data.get("type") or "").strip().lower()
        source_id = data.get("source_id")
        order_id = data.get("order_id") or data.get("order")
        sale_id = data.get("sale_id") or data.get("sale")
        delivery_person_id = data.get("delivery_person_id") or data.get("delivery_person")
        actor_role = _role(request.user)
        delivery_actor = actor_role in DELIVERY_ROLES and not _is_admin(request.user)

        order = None
        sale = None
        if source_type == "sale" or sale_id:
            sale = get_object_or_404(Sale.objects.select_related("branch", "customer", "assigned_to"), id=sale_id or source_id or order_id)
            if sale.status != "completed":
                return Response({"detail": "Only completed sales can be added to the delivery queue."}, status=400)
            if not sale.assigned_to_id:
                return Response({"detail": "Assign a delivery person to the sale before creating a run."}, status=400)
            delivery_person = sale.assigned_to
            if _role(delivery_person) not in DELIVERY_ROLES or not delivery_person.is_active:
                return Response({"detail": "Assigned delivery person is not available."}, status=400)
            if delivery_actor and sale.assigned_to_id != request.user.id:
                return Response({"detail": "You can only create runs for sales assigned to you."}, status=403)
            if delivery_person_id and str(delivery_person.id) != str(delivery_person_id):
                return Response(
                    {"detail": "Delivery run must use the delivery person already assigned to this sale."},
                    status=400,
                )
        else:
            if not order_id and not source_id:
                return Response({"order": "Order is required."}, status=400)
            order = get_object_or_404(CustomerOrder.objects.select_related("sale", "sale__customer", "sale__assigned_to"), id=order_id or source_id)
            if order.status in ("cancelled", "delivered"):
                return Response({"detail": "Cannot create a run for a cancelled or delivered order."}, status=400)

            sale = order.sale
            if not sale or not sale.assigned_to_id:
                return Response(
                    {"detail": "Assign a delivery person to the order before creating a delivery run."},
                    status=400,
                )

            delivery_person = sale.assigned_to
            if _role(delivery_person) not in DELIVERY_ROLES or not delivery_person.is_active:
                return Response({"detail": "Assigned delivery person is not available."}, status=400)
            if delivery_actor and sale.assigned_to_id != request.user.id:
                return Response({"detail": "You can only create runs for orders assigned to you."}, status=403)
            if delivery_person_id and str(delivery_person.id) != str(delivery_person_id):
                return Response(
                    {"detail": "Delivery run must use the delivery person already assigned to this order."},
                    status=400,
                )

        with transaction.atomic():
            try:
                run = DeliveryRun.objects.create(
                    order=order,
                    sale=sale if source_type == "sale" or sale_id else None,
                    delivery_person=delivery_person,
                    branch=sale.branch,
                    status="assigned",
                    notes=str(data.get("notes") or "").strip(),
                )
            except IntegrityError:
                message = "A delivery run already exists for this order." if order else "A delivery run already exists for this sale."
                return Response({"detail": message}, status=400)

        return Response({"id": str(run.id)}, status=201)


class DeliveryRunDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

    def get(self, request, run_id):
        run = get_object_or_404(
            DeliveryRun.objects.select_related("order", "order__sale", "sale", "sale__customer", "delivery_person", "branch"),
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
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

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
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

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
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

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
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

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
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

    def post(self, request, run_id):
        data = request.data or {}
        serializer = DeliveryRunCompleteSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        payload = serializer.validated_data
        with transaction.atomic():
            run = get_object_or_404(DeliveryRun.objects.select_for_update(), id=run_id)
            if not _ensure_run_access(request, run):
                return Response({"detail": "Not permitted to complete this run."}, status=403)
            if run.status in TERMINAL_STATUSES:
                return Response({"detail": "Run is already completed."}, status=400)

            recipient_name = payload["recipient_name"].strip()
            lat = payload.get("latitude")
            lng = payload.get("longitude")
            sale = getattr(run, "sale", None) or getattr(getattr(run, "order", None), "sale", None)
            if sale and sale.status != "completed":
                return Response({"detail": "Delivery payments require a completed sale."}, status=400)

            delivery_payments = payload.get("delivery_payments") or []
            delivery_payment_total = payload.get("delivery_payment_total") or Decimal("0.00")
            raw_balance = None
            if sale:
                raw_balance = getattr(sale, "balance_due", None)
                if raw_balance is None:
                    raw_balance = max(Decimal("0.00"), Decimal(str(getattr(sale, "grand_total", 0))) - Decimal(str(getattr(sale, "amount_paid", 0))))
            outstanding = money(raw_balance if raw_balance is not None else Decimal("0.00"))
            if not sale and delivery_payments:
                return Response({"detail": "Delivery payments require a linked sale."}, status=400)
            if sale and outstanding > 0 and not sale.is_credit_sale:
                return Response({"detail": "Outstanding delivery balances require a credit sale."}, status=400)
            if delivery_payment_total > outstanding:
                return Response({"delivery_payments": "Collected amount cannot exceed outstanding balance."}, status=400)

            run.status = "delivered"
            run.completed_at = timezone.now()
            run.delivered_at = run.delivered_at or run.completed_at
            run.recipient_name = recipient_name
            run.recipient_phone = payload.get("recipient_phone") or ""
            run.delivery_notes = payload.get("delivery_notes") or ""
            if lat is not None and lng is not None:
                run.end_latitude = lat
                run.end_longitude = lng
                run.last_known_latitude = lat
                run.last_known_longitude = lng
                run.last_ping_at = timezone.now()
            run.save()
            for payment_data in delivery_payments:
                sale.apply_payment(
                    amount=payment_data["amount"],
                    received_by=request.user if request.user.is_authenticated else None,
                    method=payment_data["method"],
                    reference=payment_data.get("reference", ""),
                    phone_number=payment_data.get("phone_number", ""),
                    note=payment_data.get("note", ""),
                    delivery_run=run,
                    collection_stage="delivery",
                )
            _sync_order_status_from_delivery_run(run, outcome="delivered")
        return Response({"id": str(run.id), "status": run.status}, status=200)


class DeliveryRunFailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor", "deliver_person", "delivery_person"}

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
