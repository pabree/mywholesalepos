from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, serializers
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum, Count, Q
from decimal import Decimal
from .models import Sale, SaleReturnItem
from inventory.models import Inventory, StockMovement
from .models import LedgerEntry
from .services import money
from accounts.permissions import RolePermission
from core.pagination import StandardLimitOffsetPagination

from .serializers import (
    SaleSerializer,
    SaleDetailSerializer,
    SaleCompleteSerializer,
    SalePaymentCreateSerializer,
    SaleReturnCreateSerializer,
    SaleReturnSerializer,
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
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(held_sales, request, view=self)
        page = page if page is not None else held_sales
        data = SaleDetailSerializer(page, many=True).data
        if page is not held_sales:
            return paginator.get_paginated_response(data)
        return Response(data)


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


class SaleReturnListCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        if sale.status != "completed":
            return Response({"detail": "Only completed sales can be returned."}, status=400)

        returns = sale.returns.all().order_by("-created_at")
        return_items = []
        for item in sale.items.all():
            returned_qty = (
                SaleReturnItem.objects.filter(sale_item=item)
                .aggregate(total=Sum("quantity_returned"))
                .get("total")
                or 0
            )
            remaining = item.quantity - returned_qty
            return_items.append(
                {
                    "sale_item_id": str(item.id),
                    "product_id": str(item.product_id),
                    "product_name": item.product.name,
                    "product_unit": str(item.product_unit_id) if item.product_unit_id else None,
                    "unit_price": str(item.unit_price),
                    "quantity_sold": item.quantity,
                    "quantity_returned": returned_qty,
                    "quantity_remaining": remaining,
                    "conversion_snapshot": item.conversion_snapshot,
                }
            )

        return Response(
            {
                "sale": SaleDetailSerializer(sale).data,
                "items": return_items,
                "returns": SaleReturnSerializer(returns, many=True).data,
            }
        )

    def post(self, request, sale_id):
        sale = get_object_or_404(Sale, id=sale_id)
        serializer = SaleReturnCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        dry_run = serializer.validated_data.get("dry_run", False)
        if dry_run:
            preview = serializer._build_return(sale=sale, processed_by=request.user, dry_run=True)
            return Response(
                {
                    "total_refund_amount": preview["total_refund_amount"],
                    "items": [
                        {
                            "sale_item_id": str(entry["sale_item"].id),
                            "product_name": entry["sale_item"].product.name,
                            "quantity_returned": entry["quantity_returned"],
                            "refund_amount": entry["refund_amount"],
                            "restock_to_inventory": entry["restock_to_inventory"],
                        }
                        for entry in preview["items"]
                    ],
                }
            )

        try:
            with transaction.atomic():
                sale_return = serializer._build_return(sale=sale, processed_by=request.user, dry_run=False)

                # Apply inventory restock if requested
                for item in sale_return.items.select_related("sale_item", "sale_item__product").all():
                    if not item.restock_to_inventory:
                        continue
                    sale_item = item.sale_item
                    inventory = Inventory.objects.select_for_update().get(
                        branch=sale.branch, product=sale_item.product
                    )
                    previous_qty = inventory.quantity
                    inventory.quantity = previous_qty + item.base_quantity_returned
                    inventory.save(update_fields=["quantity", "updated_at"])

                    StockMovement.objects.create(
                        inventory=inventory,
                        product=sale_item.product,
                        branch=inventory.branch,
                        sale=sale,
                        movement_type="return",
                        quantity_change=item.base_quantity_returned,
                        previous_quantity=previous_qty,
                        new_quantity=inventory.quantity,
                        notes=f"Return {sale_return.id} for Sale #{sale.id}",
                    )

                # Apply financial adjustments
                refund_amount = sale_return.total_refund_amount
                if sale.is_credit_sale:
                    balance_due = money(sale.balance_due or 0)
                    amount_paid = money(sale.amount_paid or 0)
                    remaining = money(refund_amount)
                    if balance_due > 0:
                        reduction = min(balance_due, remaining)
                        balance_due = money(balance_due - reduction)
                        remaining = money(remaining - reduction)
                    if remaining > 0:
                        amount_paid = money(max(Decimal("0.00"), amount_paid - remaining))
                    sale.balance_due = balance_due
                    sale.amount_paid = amount_paid
                else:
                    amount_paid = money(sale.amount_paid or 0)
                    if refund_amount > amount_paid:
                        raise serializers.ValidationError({"detail": "Refund exceeds amount paid."})
                    sale.amount_paid = money(amount_paid - refund_amount)

                sale.refresh_payment_status()
                sale.save(update_fields=["amount_paid", "balance_due", "payment_status", "updated_at"])

                LedgerEntry.record_refund(sale_return=sale_return, actor=request.user)

        except Inventory.DoesNotExist:
            return Response({"detail": "Inventory record not found for return."}, status=400)
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=400)

        return Response(SaleReturnSerializer(sale_return).data, status=201)
