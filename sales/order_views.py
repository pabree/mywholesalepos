from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
import csv
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import RolePermission
from accounts.models import User
from django.utils import timezone
from .models import CustomerOrder
from .serializers import SaleSerializer
from core.pagination import StandardLimitOffsetPagination
from .customer_serializers import (
    CustomerOrderStatusSerializer,
    StaffCustomerOrderListSerializer,
    StaffCustomerOrderDetailSerializer,
)

DELIVERY_ROLES = {"deliver_person", "delivery_person"}
DELIVERY_VISIBLE_ORDER_STATUSES = {"confirmed", "processing", "out_for_delivery"}


def _role(user):
    return (getattr(user, "role", "") or "").strip().lower()


def _is_admin(user):
    return getattr(user, "is_superuser", False) or _role(user) in ("admin", "supervisor")


def _is_delivery_user(user):
    return _role(user) in DELIVERY_ROLES


def _can_access_delivery_order(user, order):
    if _is_admin(user):
        return True
    if not _is_delivery_user(user) or not order or not getattr(order, "sale", None):
        return False
    sale = order.sale
    return (
        sale.assigned_to_id == getattr(user, "id", None)
        and order.status in DELIVERY_VISIBLE_ORDER_STATUSES
    )


def _backoffice_orders_queryset(request):
    status_filter = request.query_params.get("status")
    query = (request.query_params.get("q") or "").strip()
    branch_id = request.query_params.get("branch")
    route_id = request.query_params.get("route")
    customer_id = request.query_params.get("customer")

    qs = CustomerOrder.objects.select_related(
        "sale",
        "sale__branch",
        "sale__customer",
        "sale__customer__route",
        "sale__assigned_to",
    ).prefetch_related(
        "sale__items",
        "sale__items__product",
        "sale__items__product_unit",
    ).order_by("-created_at")

    if status_filter:
        qs = qs.filter(status=status_filter)

    if query:
        qs = qs.filter(
            Q(sale__customer__name__icontains=query)
            | Q(id__icontains=query)
            | Q(sale__id__icontains=query)
        )
    if customer_id:
        qs = qs.filter(sale__customer_id=customer_id)
    if branch_id:
        qs = qs.filter(sale__branch_id=branch_id)
    if route_id:
        qs = qs.filter(sale__customer__route_id=route_id)

    if _is_delivery_user(request.user) and not _is_admin(request.user):
        qs = qs.filter(
            sale__assigned_to=request.user,
            status__in=DELIVERY_VISIBLE_ORDER_STATUSES,
        )

    return qs


def _format_dt(value):
    if not value:
        return ""
    try:
        return value.isoformat(sep=" ", timespec="seconds")
    except TypeError:
        return str(value)


def _display_user(user):
    if not user:
        return ""
    display = getattr(user, "display_name", "") or ""
    if display:
        return display
    if hasattr(user, "get_full_name"):
        full_name = user.get_full_name()
        if full_name:
            return full_name
    return getattr(user, "username", "") or ""


def _orders_export_response(qs, filename):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow([
        "order_id",
        "customer",
        "branch",
        "route",
        "status",
        "total",
        "assigned",
        "created_at",
    ])
    for order in qs:
        sale = order.sale
        branch = sale.branch if sale else None
        customer = sale.customer if sale else None
        route = customer.route if customer else None
        assigned_to = sale.assigned_to if sale else None
        writer.writerow([
            str(order.id),
            customer.name if customer else "",
            branch.branch_name if branch else "",
            route.name if route else "",
            order.status,
            str(sale.grand_total) if sale else "",
            _display_user(assigned_to),
            _format_dt(order.created_at),
        ])
    return response


class CustomerOrderStaffListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "deliver_person", "delivery_person"}

    def get(self, request):
        qs = _backoffice_orders_queryset(request)

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs
        serializer = StaffCustomerOrderListSerializer(page, many=True)
        if page is not qs:
            return paginator.get_paginated_response(serializer.data)
        return Response(serializer.data)


class CustomerOrderStaffExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "deliver_person", "delivery_person"}

    def get(self, request):
        qs = _backoffice_orders_queryset(request)
        limit = request.query_params.get("limit")
        offset = request.query_params.get("offset")
        if limit is not None or offset is not None:
            paginator = StandardLimitOffsetPagination()
            page = paginator.paginate_queryset(qs, request, view=self)
            qs = page if page is not None else qs
        return _orders_export_response(qs, "backoffice-orders.csv")


class BackOfficeOrderListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        qs = _backoffice_orders_queryset(request)
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs
        serializer = StaffCustomerOrderListSerializer(page, many=True)
        if page is not qs:
            return paginator.get_paginated_response(serializer.data)
        return Response(serializer.data)


class BackOfficeOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, order_id):
        order = get_object_or_404(
            CustomerOrder.objects.select_related(
                "sale",
                "sale__branch",
                "sale__customer",
                "sale__assigned_to",
            ).prefetch_related(
                "sale__items",
                "sale__items__product",
                "sale__items__product_unit",
                "sale__payments",
            ),
            id=order_id,
        )
        serializer = StaffCustomerOrderDetailSerializer(order)
        return Response(serializer.data)


class BackOfficeOrderExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        qs = _backoffice_orders_queryset(request)
        limit = request.query_params.get("limit")
        offset = request.query_params.get("offset")
        if limit is not None or offset is not None:
            paginator = StandardLimitOffsetPagination()
            page = paginator.paginate_queryset(qs, request, view=self)
            qs = page if page is not None else qs
        return _orders_export_response(qs, "backoffice-orders.csv")


class CustomerOrderStaffDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "deliver_person", "delivery_person"}

    def get(self, request, order_id):
        order = get_object_or_404(
            CustomerOrder.objects.select_related(
                "sale",
                "sale__branch",
                "sale__customer",
                "sale__assigned_to",
            ).prefetch_related(
                "sale__items",
                "sale__items__product",
                "sale__items__product_unit",
                "sale__payments",
            ),
            id=order_id,
        )
        if not _can_access_delivery_order(request.user, order):
            return Response({"detail": "Not permitted to view this order."}, status=403)
        serializer = StaffCustomerOrderDetailSerializer(order)
        return Response(serializer.data)


class CustomerOrderAssignmentUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"salesperson", "supervisor", "admin"}

    def patch(self, request, order_id):
        order = get_object_or_404(CustomerOrder.objects.select_related("sale"), id=order_id)
        assigned_to_id = request.data.get("assigned_to")

        if assigned_to_id in ("", None):
            order.sale.assigned_to = None
            order.sale.save(update_fields=["assigned_to", "updated_at"])
            return Response({"order_id": str(order.id), "assigned_to": None})

        assigned_user = get_object_or_404(User, id=assigned_to_id)
        if assigned_user.role not in ("deliver_person", "salesperson"):
            return Response(
                {"assigned_to": "Assigned user must be a delivery person or salesperson."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.sale.assigned_to = assigned_user
        order.sale.save(update_fields=["assigned_to", "updated_at"])
        return Response({"order_id": str(order.id), "assigned_to": str(assigned_user.id)})


class CustomerOrderStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"salesperson", "supervisor", "admin", "deliver_person", "delivery_person"}

    def patch(self, request, order_id):
        with transaction.atomic():
            order = get_object_or_404(CustomerOrder.objects.select_for_update(), id=order_id)
            if not _can_access_delivery_order(request.user, order):
                return Response({"detail": "Not permitted to update this order."}, status=status.HTTP_403_FORBIDDEN)
            serializer = CustomerOrderStatusSerializer(order, data=request.data, partial=True)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            if "status" not in serializer.validated_data:
                return Response({"status": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)

            new_status = serializer.validated_data["status"]
            serializer.save()

            if new_status == "cancelled" and order.sale.status != "cancelled":
                try:
                    order.sale.cancel()
                except ValueError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"order_id": str(order.id), "status": order.status})


class CustomerOrderCreditApproveView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"salesperson", "supervisor", "admin"}

    def post(self, request, order_id):
        with transaction.atomic():
            order = get_object_or_404(
                CustomerOrder.objects.select_for_update().select_related("sale"),
                id=order_id,
            )
            if not order.credit_requested or order.credit_approval_status != "pending":
                return Response(
                    {"detail": "Credit approval is not pending for this order."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            sale = order.sale
            if sale.status == "cancelled":
                return Response({"detail": "Cancelled sales cannot be approved for credit."}, status=status.HTTP_400_BAD_REQUEST)
            if sale.assigned_to_id is None:
                return Response(
                    {"assigned_to": "Assign a delivery/salesperson before approving credit."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = SaleSerializer(
                sale,
                data={"is_credit_sale": True, "payment_mode": "credit"},
                partial=True,
            )
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()

            order.credit_approval_status = "approved"
            order.credit_approved_by = request.user
            order.credit_approved_at = timezone.now()
            order.credit_rejection_reason = ""
            if order.status == "pending_credit_approval":
                order.status = "confirmed"
            order.save(
                update_fields=[
                    "credit_approval_status",
                    "credit_approved_by",
                    "credit_approved_at",
                    "credit_rejection_reason",
                    "status",
                    "updated_at",
                ]
            )
        return Response({"order_id": str(order.id), "credit_approval_status": order.credit_approval_status})


class CustomerOrderCreditRejectView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"salesperson", "supervisor", "admin"}

    def post(self, request, order_id):
        reason = (request.data.get("reason") or "").strip()
        with transaction.atomic():
            order = get_object_or_404(
                CustomerOrder.objects.select_for_update().select_related("sale"),
                id=order_id,
            )
            if not order.credit_requested or order.credit_approval_status != "pending":
                return Response(
                    {"detail": "Credit approval is not pending for this order."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            order.credit_approval_status = "rejected"
            order.credit_approved_by = request.user
            order.credit_approved_at = timezone.now()
            order.credit_rejection_reason = reason
            if order.status == "pending_credit_approval":
                order.status = "pending"
            order.save(
                update_fields=[
                    "credit_approval_status",
                    "credit_approved_by",
                    "credit_approved_at",
                    "credit_rejection_reason",
                    "status",
                    "updated_at",
                ]
            )
        return Response({"order_id": str(order.id), "credit_approval_status": order.credit_approval_status})
