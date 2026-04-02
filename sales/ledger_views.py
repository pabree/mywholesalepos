from datetime import timedelta
from decimal import Decimal
from django.db.models import Sum, OuterRef, Subquery, DecimalField, F, Value, ExpressionWrapper
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from accounts.permissions import RolePermission
from expenses.models import Expense
from .models import LedgerEntry, Sale, SaleItem, SaleReturnItem
from .services import money
from .ledger_serializers import LedgerEntrySerializer
from core.pagination import StandardLimitOffsetPagination


def _parse_date_param(value, label):
    if not value:
        return None, None
    parsed = parse_date(value)
    if not parsed:
        return None, f"Invalid {label} date."
    return parsed, None


def _apply_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(created_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(created_at__date__lte=end_date)
    return qs


def _extract_date_range(request):
    start_raw = request.query_params.get("date_from") or request.query_params.get("start")
    end_raw = request.query_params.get("date_to") or request.query_params.get("end")
    start_date, start_error = _parse_date_param(start_raw, "date_from")
    end_date, end_error = _parse_date_param(end_raw, "date_to")
    if start_error or end_error:
        return None, None, start_error or end_error
    return start_date, end_date, None


def _apply_sales_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(completed_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(completed_at__date__lte=end_date)
    return qs


def _apply_sale_item_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(sale__completed_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(sale__completed_at__date__lte=end_date)
    return qs


def _apply_return_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(sale_return__created_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(sale_return__created_at__date__lte=end_date)
    return qs


def _apply_expense_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)
    return qs


def _build_finance_summary(*, start_date=None, end_date=None, branch_id=None):
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    zero = Decimal("0.00")

    sales_base = Sale.objects.filter(status="completed")
    if branch_id:
        sales_base = sales_base.filter(branch_id=branch_id)

    sales_today = sales_base.filter(completed_at__date=today).aggregate(total=Sum("grand_total"))["total"] or zero
    sales_week = sales_base.filter(completed_at__date__gte=week_start).aggregate(total=Sum("grand_total"))["total"] or zero
    sales_month = sales_base.filter(completed_at__date__gte=month_start).aggregate(total=Sum("grand_total"))["total"] or zero
    if start_date or end_date:
        sales_filtered = _apply_sales_date_range(sales_base, start_date, end_date)
        sales_today = sales_filtered.filter(completed_at__date=today).aggregate(total=Sum("grand_total"))["total"] or zero
        sales_week = sales_filtered.filter(completed_at__date__gte=week_start).aggregate(total=Sum("grand_total"))["total"] or zero
        sales_month = sales_filtered.filter(completed_at__date__gte=month_start).aggregate(total=Sum("grand_total"))["total"] or zero

    sale_items_base = SaleItem.objects.filter(sale__status="completed")
    if branch_id:
        sale_items_base = sale_items_base.filter(sale__branch_id=branch_id)

    cost_today = sale_items_base.filter(sale__completed_at__date=today).aggregate(total=Sum("total_cost_snapshot"))["total"] or zero
    cost_month = sale_items_base.filter(sale__completed_at__date__gte=month_start).aggregate(total=Sum("total_cost_snapshot"))["total"] or zero

    if start_date or end_date:
        sale_items_filtered = _apply_sale_item_date_range(sale_items_base, start_date, end_date)
        cost_today = sale_items_filtered.filter(sale__completed_at__date=today).aggregate(total=Sum("total_cost_snapshot"))["total"] or zero
        cost_month = sale_items_filtered.filter(sale__completed_at__date__gte=month_start).aggregate(total=Sum("total_cost_snapshot"))["total"] or zero

    return_items_base = SaleReturnItem.objects.select_related("sale_item", "sale_return", "sale_item__sale")
    if branch_id:
        return_items_base = return_items_base.filter(sale_item__sale__branch_id=branch_id)

    return_cost_expr = ExpressionWrapper(
        F("quantity_returned") * F("sale_item__cost_price_snapshot"),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )

    returns_today_qs = return_items_base.filter(sale_return__created_at__date=today)
    returns_refund_today = returns_today_qs.aggregate(total=Sum("refund_amount"))["total"] or zero
    returns_cost_today = returns_today_qs.aggregate(total=Sum(return_cost_expr))["total"] or zero
    returns_month_qs = return_items_base.filter(sale_return__created_at__date__gte=month_start)
    returns_refund_month = returns_month_qs.aggregate(total=Sum("refund_amount"))["total"] or zero
    returns_cost_month = returns_month_qs.aggregate(total=Sum(return_cost_expr))["total"] or zero

    if start_date or end_date:
        return_items_filtered = _apply_return_date_range(return_items_base, start_date, end_date)
        returns_today_qs = return_items_filtered.filter(sale_return__created_at__date=today)
        returns_refund_today = returns_today_qs.aggregate(total=Sum("refund_amount"))["total"] or zero
        returns_cost_today = returns_today_qs.aggregate(total=Sum(return_cost_expr))["total"] or zero
        returns_month_qs = return_items_filtered.filter(sale_return__created_at__date__gte=month_start)
        returns_refund_month = returns_month_qs.aggregate(total=Sum("refund_amount"))["total"] or zero
        returns_cost_month = returns_month_qs.aggregate(total=Sum(return_cost_expr))["total"] or zero

    inflow_qs = LedgerEntry.objects.filter(
        direction="in",
        entry_type__in=["sale_payment", "credit_payment"],
    )
    if branch_id:
        inflow_qs = inflow_qs.filter(sale__branch_id=branch_id)
    inflow_qs = _apply_date_range(inflow_qs, start_date, end_date)

    collected_today = inflow_qs.filter(created_at__date=today).aggregate(total=Sum("amount"))["total"] or zero
    credit_collected_total = inflow_qs.filter(entry_type="credit_payment").aggregate(total=Sum("amount"))["total"] or zero
    collected_month = inflow_qs.filter(created_at__date__gte=month_start).aggregate(total=Sum("amount"))["total"] or zero
    credit_recovered_month = inflow_qs.filter(entry_type="credit_payment", created_at__date__gte=month_start).aggregate(total=Sum("amount"))["total"] or zero

    refunds_qs = LedgerEntry.objects.filter(direction="out", entry_type="refund")
    if branch_id:
        refunds_qs = refunds_qs.filter(sale__branch_id=branch_id)
    refunds_qs = _apply_date_range(refunds_qs, start_date, end_date)
    refunds_month = refunds_qs.filter(created_at__date__gte=month_start).aggregate(total=Sum("amount"))["total"] or zero

    credit_base = Sale.objects.filter(is_credit_sale=True, status="completed")
    if branch_id:
        credit_base = credit_base.filter(branch_id=branch_id)
    outstanding_credit = credit_base.filter(balance_due__gt=0).aggregate(total=Sum("balance_due"))["total"] or zero
    overdue_credit = credit_base.filter(balance_due__gt=0, due_date__lt=today).aggregate(total=Sum("balance_due"))["total"] or zero

    credit_month_qs = credit_base.filter(completed_at__date__gte=month_start)
    if start_date or end_date:
        credit_month_qs = _apply_sales_date_range(credit_month_qs, start_date, end_date)

    zero_decimal = Value(Decimal("0.00"), output_field=DecimalField(max_digits=12, decimal_places=2))
    upfront_payment_subquery = (
        LedgerEntry.objects.filter(
            sale_id=OuterRef("pk"),
            entry_type="credit_payment",
            payment__isnull=True,
        )
        .values("sale_id")
        .annotate(total=Sum("amount"))
        .values("total")[:1]
    )
    credit_issued_month_total = (
        credit_month_qs.annotate(
            upfront_collected=Coalesce(
                Subquery(upfront_payment_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
                zero_decimal,
            ),
            issued_amount=F("grand_total") - Coalesce(
                Subquery(upfront_payment_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
                zero_decimal,
            ),
        )
        .aggregate(total=Sum("issued_amount"))["total"] or zero
    )

    expense_base = Expense.objects.filter(is_active=True)
    if branch_id:
        expense_base = expense_base.filter(branch_id=branch_id)
    expense_base = _apply_expense_date_range(expense_base, start_date, end_date)
    expenses_today = expense_base.filter(date=today).aggregate(total=Sum("amount"))["total"] or zero
    expenses_month = expense_base.filter(date__gte=month_start).aggregate(total=Sum("amount"))["total"] or zero
    net_position = collected_month - refunds_month - expenses_month

    gross_profit_today = money(
        (sales_today - cost_today) - (returns_refund_today - returns_cost_today)
    )
    gross_profit_month = money(
        (sales_month - cost_month) - (returns_refund_month - returns_cost_month)
    )
    gross_margin_percent_month = zero
    if sales_month and sales_month > 0:
        gross_margin_percent_month = money((gross_profit_month / sales_month) * Decimal("100"))

    return {
        "sales_today": sales_today,
        "sales_week": sales_week,
        "sales_month": sales_month,
        "gross_profit_today": gross_profit_today,
        "gross_profit_month": gross_profit_month,
        "gross_margin_percent_month": gross_margin_percent_month,
        "collected_today": collected_today,
        "credit_collected_total": credit_collected_total,
        "collected_month": collected_month,
        "outstanding_credit": outstanding_credit,
        "overdue_credit": overdue_credit,
        "credit_issued_month": credit_issued_month_total,
        "credit_recovered_month": credit_recovered_month,
        "refunds_month": refunds_month,
        "expenses_today": expenses_today,
        "expenses_month": expenses_month,
        "net_position": net_position,
    }


class LedgerEntryListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)

        qs = LedgerEntry.objects.select_related("sale", "payment", "customer", "actor")
        qs = _apply_date_range(qs, start_date, end_date)

        entry_type = request.query_params.get("entry_type")
        if entry_type:
            entry_types = [t.strip() for t in entry_type.split(",") if t.strip()]
            if entry_types:
                qs = qs.filter(entry_type__in=entry_types)

        customer_id = request.query_params.get("customer")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        actor_id = request.query_params.get("user")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        branch_id = request.query_params.get("branch")
        if branch_id:
            qs = qs.filter(sale__branch_id=branch_id)

        direction = request.query_params.get("direction")
        if direction:
            qs = qs.filter(direction=direction)

        qs = qs.order_by("-created_at")
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs
        data = LedgerEntrySerializer(page, many=True).data
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class LedgerSummaryView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        summary = _build_finance_summary(start_date=start_date, end_date=end_date, branch_id=branch_id)
        return Response(summary)


class FinanceExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        include_entries = request.query_params.get("include_entries") == "1"
        summary = _build_finance_summary(start_date=start_date, end_date=end_date, branch_id=branch_id)

        rows = ["metric,value"]
        for key, value in summary.items():
            rows.append(f"{key},{value}")

        if include_entries:
            rows.append("")
            rows.append("ledger_entries")
            rows.append("created_at,entry_type,amount,customer,sale_id,payment_id,actor")
            entries = LedgerEntry.objects.select_related("customer", "sale", "payment", "actor")
            if branch_id:
                entries = entries.filter(sale__branch_id=branch_id)
            entries = _apply_date_range(entries, start_date, end_date).order_by("-created_at")
            for entry in entries:
                customer = entry.customer.name if entry.customer else ""
                actor = ""
                if entry.actor:
                    actor = f"{entry.actor.first_name or ''} {entry.actor.last_name or ''}".strip() or entry.actor.username or entry.actor.email or ""
                rows.append(
                    f"{entry.created_at},{entry.entry_type},{entry.amount},{customer},{entry.sale_id or ''},{entry.payment_id or ''},{actor}"
                )

        response = HttpResponse("\n".join(rows), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="finance_export.csv"'
        return response
