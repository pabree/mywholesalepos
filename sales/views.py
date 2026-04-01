from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum, Count, Q
from .models import Sale
from accounts.permissions import RolePermission

from .serializers import (
    SaleSerializer,
    SaleDetailSerializer,
    SaleCompleteSerializer,
    SalePaymentCreateSerializer,
)


class SaleCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request):
        serializer = SaleSerializer(data=request.data)
        if serializer.is_valid():
            sale = serializer.save()
            return Response(
                SaleDetailSerializer(sale).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SaleDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        return Response(SaleDetailSerializer(sale).data)

    def patch(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        serializer = SaleSerializer(sale, data=request.data, partial=True)
        if serializer.is_valid():
            sale = serializer.save()
            return Response(SaleDetailSerializer(sale).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        serializer = SaleSerializer(sale, data=request.data)
        if serializer.is_valid():
            sale = serializer.save()
            return Response(SaleDetailSerializer(sale).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SaleHoldView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        try:
            sale.hold()
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Sale held", "sale_id": sale.id, "status": sale.status})


class SaleResumeView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        try:
            sale.resume()
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(SaleDetailSerializer(sale).data)


class SaleCancelView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        try:
            sale.cancel()
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Sale cancelled", "sale_id": sale.id, "status": sale.status})


class SaleCompleteView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request, sale_id):
        serializer = SaleCompleteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sale = get_object_or_404(Sale.objects.select_for_update(), id=sale_id)
            sale = serializer.save(sale=sale)
            return Response(
                {"message": "Sale completed", "sale_id": sale.id, "status": sale.status},
                status=status.HTTP_200_OK,
            )


class HeldSalesListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        held_sales = Sale.objects.filter(status="held").order_by("-updated_at")
        return Response(SaleDetailSerializer(held_sales, many=True).data)


class SalePaymentCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        serializer = SalePaymentCreateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                payment = serializer.save(sale=sale, received_by=request.user)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"message": "Payment recorded", "payment_id": payment.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OverdueCreditSalesView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        today = timezone.localdate()
        overdue_sales = Sale.objects.filter(
            is_credit_sale=True,
            balance_due__gt=0,
            due_date__lt=today,
            status="completed",
        ).order_by("-due_date")
        return Response(SaleDetailSerializer(overdue_sales, many=True).data)


class OpenCreditSalesView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        customer_id = request.query_params.get("customer")
        assigned_to_id = request.query_params.get("assigned_to")
        qs = Sale.objects.filter(is_credit_sale=True, balance_due__gt=0, status="completed")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if assigned_to_id:
            qs = qs.filter(assigned_to_id=assigned_to_id)
        qs = qs.order_by("-due_date", "-updated_at")
        return Response(SaleDetailSerializer(qs, many=True).data)


class CreditCustomerSummaryView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, customer_id):
        today = timezone.localdate()
        base_qs = Sale.objects.filter(
            is_credit_sale=True,
            status="completed",
            customer_id=customer_id,
        )
        open_qs = base_qs.filter(balance_due__gt=0)
        overdue_qs = open_qs.filter(due_date__lt=today)

        summary = open_qs.aggregate(
            total_outstanding=Sum("balance_due"),
            open_count=Count("id"),
            unpaid_count=Count("id", filter=Q(payment_status="unpaid")),
            partial_count=Count("id", filter=Q(payment_status="partial")),
        )
        overdue_balance = overdue_qs.aggregate(total=Sum("balance_due"))["total"]
        overdue_count = overdue_qs.count()

        return Response(
            {
                "customer_id": str(customer_id),
                "total_outstanding": summary["total_outstanding"] or 0,
                "overdue_balance": overdue_balance or 0,
                "open_count": summary["open_count"] or 0,
                "unpaid_count": summary["unpaid_count"] or 0,
                "partial_count": summary["partial_count"] or 0,
                "overdue_count": overdue_count,
            }
        )


class CreditAssignedSummaryView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, user_id):
        today = timezone.localdate()
        base_qs = Sale.objects.filter(
            is_credit_sale=True,
            status="completed",
            assigned_to_id=user_id,
        )
        open_qs = base_qs.filter(balance_due__gt=0)
        overdue_qs = open_qs.filter(due_date__lt=today)

        summary = open_qs.aggregate(
            total_outstanding=Sum("balance_due"),
            open_count=Count("id"),
            unpaid_count=Count("id", filter=Q(payment_status="unpaid")),
            partial_count=Count("id", filter=Q(payment_status="partial")),
        )
        overdue_balance = overdue_qs.aggregate(total=Sum("balance_due"))["total"]
        overdue_count = overdue_qs.count()

        return Response(
            {
                "assigned_to": str(user_id),
                "total_outstanding": summary["total_outstanding"] or 0,
                "overdue_balance": overdue_balance or 0,
                "open_count": summary["open_count"] or 0,
                "unpaid_count": summary["unpaid_count"] or 0,
                "partial_count": summary["partial_count"] or 0,
                "overdue_count": overdue_count,
            }
        )

class SaleReceiptView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        if sale.status != "completed":
            return Response({"error": "Sale is not completed"}, status=400)

        items = [
            {
                "product": item.product.name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total": item.total_price,
            }
            for item in sale.items.all()
        ]

        receipt = {
            "sale_id": sale.id,
            "date": sale.sale_date,
            "items": items,
            "total": sale.grand_total,
            "paid": sale.amount_paid,
            "balance": sale.balance,
        }

        return Response(receipt)
