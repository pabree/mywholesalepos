from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import RolePermission
from accounts.models import User
from django.utils import timezone
from .models import CustomerOrder
from .serializers import SaleSerializer
from .customer_serializers import (
    CustomerOrderStatusSerializer,
    StaffCustomerOrderListSerializer,
    StaffCustomerOrderDetailSerializer,
)


class CustomerOrderStaffListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "deliver_person"}

    def get(self, request):
        status_filter = request.query_params.get("status")
        query = (request.query_params.get("q") or "").strip()

        qs = CustomerOrder.objects.select_related(
            "sale",
            "sale__branch",
            "sale__customer",
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

        serializer = StaffCustomerOrderListSerializer(qs, many=True)
        return Response(serializer.data)


class CustomerOrderStaffDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "deliver_person"}

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
    allowed_roles = {"salesperson", "supervisor", "admin", "deliver_person"}

    def patch(self, request, order_id):
        with transaction.atomic():
            order = get_object_or_404(CustomerOrder.objects.select_for_update(), id=order_id)
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
