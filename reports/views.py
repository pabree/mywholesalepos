from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum, F
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission
from inventory.models import Inventory
from sales.models import CustomerOrder, Sale, SaleItem

from .serializers import (
    DashboardSummarySerializer,
    InventorySummarySerializer,
    SalesSummarySerializer,
    TopProductsSerializer,
)


def _parse_date(value, label):
    if not value:
        return None, None
    parsed = parse_date(value)
    if not parsed:
        return None, f"Invalid {label} date."
    return parsed, None


def _extract_date_range(request, default_days=7):
    start_raw = request.query_params.get("date_from") or request.query_params.get("start")
    end_raw = request.query_params.get("date_to") or request.query_params.get("end")
    start_date, start_error = _parse_date(start_raw, "date_from")
    end_date, end_error = _parse_date(end_raw, "date_to")
    if start_error or end_error:
        return None, None, start_error or end_error

    if start_date or end_date:
        if not end_date:
            end_date = timezone.localdate()
        if not start_date:
            start_date = end_date - timedelta(days=max(default_days - 1, 0))
        return start_date, end_date, None

    days_param = request.query_params.get("days")
    try:
        days = int(days_param) if days_param else default_days
    except (TypeError, ValueError):
        days = default_days
    if days <= 0:
        days = default_days
    end_date = timezone.localdate()
    start_date = end_date - timedelta(days=days - 1)
    return start_date, end_date, None


def _apply_sale_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(completed_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(completed_at__date__lte=end_date)
    return qs


def _date_range_list(start_date, end_date):
    if not start_date or not end_date:
        return []
    days = (end_date - start_date).days
    return [start_date + timedelta(days=i) for i in range(days + 1)]


def _top_products(*, start_date=None, end_date=None, branch_id=None, limit=10):
    qs = SaleItem.objects.filter(sale__status="completed")
    if branch_id:
        qs = qs.filter(sale__branch_id=branch_id)
    qs = _apply_sale_range(qs, start_date, end_date)
    rows = (
        qs.values("product_id", "product__name")
        .annotate(
            total_quantity=Coalesce(Sum("base_quantity"), 0),
            total_revenue=Coalesce(Sum("total_price"), Decimal("0.00")),
        )
        .order_by("-total_quantity")[:limit]
    )
    return [
        {
            "product_id": str(row["product_id"]),
            "product_name": row["product__name"] or "",
            "total_quantity": int(row["total_quantity"] or 0),
            "total_revenue": row["total_revenue"] or Decimal("0.00"),
        }
        for row in rows
    ]


class SalesSummaryReportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def get(self, request):
        start_date, end_date, error = _extract_date_range(request, default_days=7)
        if error:
            return Response({"detail": error}, status=400)

        sales_qs = Sale.objects.filter(status="completed")
        branch_id = request.query_params.get("branch")
        if branch_id:
            sales_qs = sales_qs.filter(branch_id=branch_id)
        sales_qs = _apply_sale_range(sales_qs, start_date, end_date)

        totals = sales_qs.aggregate(
            total_sales=Coalesce(Sum("grand_total"), Decimal("0.00")),
            total_orders=Count("id"),
        )
        total_sales = totals.get("total_sales") or Decimal("0.00")
        total_orders = totals.get("total_orders") or 0
        average = total_sales / total_orders if total_orders else Decimal("0.00")

        by_day_qs = (
            sales_qs.annotate(day=TruncDate("completed_at"))
            .values("day")
            .annotate(
                total_sales=Coalesce(Sum("grand_total"), Decimal("0.00")),
                total_orders=Count("id"),
            )
        )
        by_day_map = {row["day"]: row for row in by_day_qs}
        sales_by_day = []
        for day in _date_range_list(start_date, end_date):
            row = by_day_map.get(day)
            sales_by_day.append(
                {
                    "date": day,
                    "total_sales": (row or {}).get("total_sales") or Decimal("0.00"),
                    "total_orders": (row or {}).get("total_orders") or 0,
                }
            )

        payment_rows = (
            sales_qs.values("payment_mode")
            .annotate(
                total_sales=Coalesce(Sum("grand_total"), Decimal("0.00")),
                total_orders=Count("id"),
            )
            .order_by("-total_sales")
        )
        sales_by_payment_method = [
            {
                "payment_method": row["payment_mode"] or "unknown",
                "total_sales": row["total_sales"] or Decimal("0.00"),
                "total_orders": row["total_orders"] or 0,
            }
            for row in payment_rows
        ]

        payload = {
            "total_sales": total_sales,
            "total_orders": total_orders,
            "average_order_value": average,
            "sales_by_day": sales_by_day,
            "sales_by_payment_method": sales_by_payment_method,
        }
        serializer = SalesSummarySerializer(payload)
        return Response(serializer.data)


class TopProductsReportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def get(self, request):
        start_date, end_date, error = _extract_date_range(request, default_days=7)
        if error:
            return Response({"detail": error}, status=400)
        branch_id = request.query_params.get("branch")
        top_products = _top_products(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            limit=10,
        )
        serializer = TopProductsSerializer({"top_products": top_products})
        return Response(serializer.data)


class InventorySummaryReportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def get(self, request):
        branch_id = request.query_params.get("branch")
        qs = Inventory.objects.select_related("product", "branch")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        low_stock_qs = qs.filter(quantity__lte=F("reorder_level"), quantity__gt=0)
        out_stock_qs = qs.filter(quantity__lte=0)

        low_stock_count = low_stock_qs.count()
        out_stock_count = out_stock_qs.count()

        low_stock_products = [
            {
                "product_id": str(item.product_id),
                "product_name": item.product.name if item.product else "",
                "sku": item.product.sku if item.product else "",
                "quantity": item.quantity,
                "reorder_level": item.reorder_level,
                "branch_id": str(item.branch_id) if item.branch_id else None,
                "branch_name": item.branch.branch_name if item.branch else None,
            }
            for item in low_stock_qs.order_by("quantity")[:20]
        ]

        payload = {
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_stock_count,
            "low_stock_products": low_stock_products,
        }
        serializer = InventorySummarySerializer(payload)
        return Response(serializer.data)


class DashboardSummaryReportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=6)
        branch_id = request.query_params.get("branch")

        sales_qs = Sale.objects.filter(status="completed")
        if branch_id:
            sales_qs = sales_qs.filter(branch_id=branch_id)

        today_sales = sales_qs.filter(completed_at__date=today).aggregate(
            total=Coalesce(Sum("grand_total"), Decimal("0.00"))
        )["total"]
        week_sales = _apply_sale_range(sales_qs, week_start, today).aggregate(
            total=Coalesce(Sum("grand_total"), Decimal("0.00"))
        )["total"]

        pending_statuses = [
            "pending",
            "pending_credit_approval",
            "confirmed",
            "processing",
            "out_for_delivery",
        ]
        orders_qs = CustomerOrder.objects.filter(status__in=pending_statuses)
        if branch_id:
            orders_qs = orders_qs.filter(sale__branch_id=branch_id)
        pending_orders_count = orders_qs.count()

        inventory_qs = Inventory.objects.all()
        if branch_id:
            inventory_qs = inventory_qs.filter(branch_id=branch_id)
        low_stock_count = inventory_qs.filter(quantity__lte=F("reorder_level")).count()

        top_products = _top_products(
            start_date=week_start,
            end_date=today,
            branch_id=branch_id,
            limit=5,
        )

        payload = {
            "today_sales": today_sales or Decimal("0.00"),
            "week_sales": week_sales or Decimal("0.00"),
            "pending_orders_count": pending_orders_count,
            "low_stock_count": low_stock_count,
            "top_products": top_products,
        }
        serializer = DashboardSummarySerializer(payload)
        return Response(serializer.data)
