from decimal import Decimal
from django.db.models import Sum, Count, F, Value, DecimalField, OuterRef, Subquery, ExpressionWrapper, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import RolePermission
from accounts.models import User
from logistics.models import Route
from .models import Sale, LedgerEntry, SaleItem, SaleReturnItem, CustomerOrder
from .services import money


def _parse_date_param(value, label):
    if not value:
        return None, None
    parsed = parse_date(value)
    if not parsed:
        return None, f"Invalid {label} date."
    return parsed, None


def _extract_date_range(request):
    start_raw = request.query_params.get("date_from") or request.query_params.get("start")
    end_raw = request.query_params.get("date_to") or request.query_params.get("end")
    start_date, start_error = _parse_date_param(start_raw, "date_from")
    end_date, end_error = _parse_date_param(end_raw, "date_to")
    if start_error or end_error:
        return None, None, start_error or end_error
    return start_date, end_date, None


def _apply_sale_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(completed_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(completed_at__date__lte=end_date)
    return qs


def _apply_entry_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(created_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(created_at__date__lte=end_date)
    return qs


def _apply_return_date_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(sale_return__created_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(sale_return__created_at__date__lte=end_date)
    return qs


def _apply_order_created_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(created_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(created_at__date__lte=end_date)
    return qs


def _apply_order_updated_range(qs, start_date, end_date):
    if start_date:
        qs = qs.filter(updated_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(updated_at__date__lte=end_date)
    return qs


def _user_label(user):
    if not user:
        return ""
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.username or user.email or ""


def _normalize_role(value):
    return (value or "").strip().lower()


def _performance_user_list(*, role=None, branch_id=None, is_active=None):
    qs = User.objects.select_related("branch")
    if role:
        qs = qs.filter(role__iexact=role)
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    if is_active is None:
        qs = qs.filter(is_active=True)
    else:
        qs = qs.filter(is_active=is_active)
    qs = qs.order_by("first_name", "last_name", "username")
    data = []
    for user in qs:
        data.append(
            {
                "id": str(user.id),
                "username": user.username,
                "full_name": _user_label(user),
                "role": _normalize_role(user.role),
                "branch_id": str(user.branch_id) if user.branch_id else None,
                "branch_name": user.branch.branch_name if user.branch else None,
            }
        )
    return data


def _cashier_performance(*, start_date=None, end_date=None, branch_id=None, user_id=None):
    zero = Decimal("0.00")
    sales_base = Sale.objects.filter(status="completed")
    if branch_id:
        sales_base = sales_base.filter(branch_id=branch_id)
    sales_base = _apply_sale_date_range(sales_base, start_date, end_date)
    sales_base = sales_base.annotate(
        cashier_id=Coalesce("completed_by_id", "created_by_id"),
    )
    if user_id:
        sales_base = sales_base.filter(cashier_id=user_id)

    sales_rows = sales_base.values("cashier_id").annotate(
        sales_count=Count("id"),
        sales_total=Coalesce(Sum("grand_total"), zero),
    )

    collections_qs = LedgerEntry.objects.filter(
        direction="in",
        entry_type__in=["sale_payment", "credit_payment"],
    )
    if branch_id:
        collections_qs = collections_qs.filter(sale__branch_id=branch_id)
    collections_qs = _apply_entry_date_range(collections_qs, start_date, end_date)
    if user_id:
        collections_qs = collections_qs.filter(actor_id=user_id)
    collections_rows = collections_qs.values("actor_id").annotate(
        collections_total=Coalesce(Sum("amount"), zero),
    )

    refunds_qs = LedgerEntry.objects.filter(
        direction="out",
        entry_type="refund",
    )
    if branch_id:
        refunds_qs = refunds_qs.filter(sale__branch_id=branch_id)
    refunds_qs = _apply_entry_date_range(refunds_qs, start_date, end_date)
    if user_id:
        refunds_qs = refunds_qs.filter(actor_id=user_id)
    refunds_rows = refunds_qs.values("actor_id").annotate(
        refunds_count=Count("id"),
        refunds_total=Coalesce(Sum("amount"), zero),
    )

    metrics = {}
    for row in sales_rows:
        metrics[row["cashier_id"]] = {
            "sales_count_processed": row["sales_count"],
            "sales_total_processed": row["sales_total"],
        }

    for row in collections_rows:
        entry = metrics.setdefault(row["actor_id"], {})
        entry["collections_processed"] = row["collections_total"]

    for row in refunds_rows:
        entry = metrics.setdefault(row["actor_id"], {})
        entry["refunds_processed_count"] = row["refunds_count"]
        entry["refunds_total"] = row["refunds_total"]

    user_ids = [uid for uid in metrics.keys() if uid]
    users = {str(u.id): u for u in User.objects.filter(id__in=user_ids)}

    results = []
    for uid, data in metrics.items():
        user = users.get(str(uid)) if uid else None
        sales_count = data.get("sales_count_processed", 0) or 0
        sales_total = money(data.get("sales_total_processed", zero))
        avg_sale = money(sales_total / sales_count) if sales_count else zero
        results.append(
            {
                "user_id": str(uid) if uid else None,
                "user_name": _user_label(user) or "Unassigned",
                "role": (user.role if user else "unknown"),
                "sales_count_processed": sales_count,
                "sales_total_processed": sales_total,
                "collections_processed": money(data.get("collections_processed", zero)),
                "refunds_processed_count": data.get("refunds_processed_count", 0) or 0,
                "refunds_total": money(data.get("refunds_total", zero)),
                "average_sale_value": avg_sale,
            }
        )

    results.sort(key=lambda item: Decimal(str(item.get("sales_total_processed", "0"))), reverse=True)
    return results


def _salesperson_performance(*, start_date=None, end_date=None, branch_id=None, user_id=None):
    zero = Decimal("0.00")
    sales_base = Sale.objects.filter(status="completed", assigned_to__role="salesperson")
    if branch_id:
        sales_base = sales_base.filter(branch_id=branch_id)
    sales_base = _apply_sale_date_range(sales_base, start_date, end_date)
    if user_id:
        sales_base = sales_base.filter(assigned_to_id=user_id)

    sales_rows = sales_base.values("assigned_to_id").annotate(
        sales_count=Count("id"),
        sales_total=Coalesce(Sum("grand_total"), zero),
    )

    cost_qs = SaleItem.objects.filter(sale__status="completed", sale__assigned_to__role="salesperson")
    if branch_id:
        cost_qs = cost_qs.filter(sale__branch_id=branch_id)
    cost_qs = _apply_sale_date_range(cost_qs, start_date, end_date)
    if user_id:
        cost_qs = cost_qs.filter(sale__assigned_to_id=user_id)
    cost_rows = cost_qs.values("sale__assigned_to_id").annotate(
        cost_total=Coalesce(Sum("total_cost_snapshot"), zero),
    )

    return_qs = SaleReturnItem.objects.filter(sale_item__sale__assigned_to__role="salesperson")
    if branch_id:
        return_qs = return_qs.filter(sale_item__sale__branch_id=branch_id)
    return_qs = _apply_return_date_range(return_qs, start_date, end_date)
    if user_id:
        return_qs = return_qs.filter(sale_item__sale__assigned_to_id=user_id)

    return_cost_expr = ExpressionWrapper(
        F("quantity_returned") * F("sale_item__cost_price_snapshot"),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )
    return_rows = return_qs.values("sale_item__sale__assigned_to_id").annotate(
        refund_total=Coalesce(Sum("refund_amount"), zero),
        return_cost_total=Coalesce(Sum(return_cost_expr), zero),
    )

    credit_sales = sales_base.filter(is_credit_sale=True)
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
    credit_rows = (
        credit_sales.annotate(
            upfront_collected=Coalesce(
                Subquery(upfront_payment_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
                zero_decimal,
            ),
            issued_amount=F("grand_total") - Coalesce(
                Subquery(upfront_payment_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
                zero_decimal,
            ),
        )
        .values("assigned_to_id")
        .annotate(credit_issued=Coalesce(Sum("issued_amount"), zero))
    )

    credit_recovered_qs = LedgerEntry.objects.filter(
        entry_type="credit_payment",
        payment__isnull=False,
        direction="in",
        sale__assigned_to__role="salesperson",
    )
    if branch_id:
        credit_recovered_qs = credit_recovered_qs.filter(sale__branch_id=branch_id)
    credit_recovered_qs = _apply_entry_date_range(credit_recovered_qs, start_date, end_date)
    if user_id:
        credit_recovered_qs = credit_recovered_qs.filter(sale__assigned_to_id=user_id)
    credit_recovered_rows = credit_recovered_qs.values("sale__assigned_to_id").annotate(
        credit_recovered=Coalesce(Sum("amount"), zero),
    )

    credit_base = Sale.objects.filter(is_credit_sale=True, status="completed", assigned_to__role="salesperson")
    if branch_id:
        credit_base = credit_base.filter(branch_id=branch_id)
    credit_base = _apply_sale_date_range(credit_base, start_date, end_date)
    if user_id:
        credit_base = credit_base.filter(assigned_to_id=user_id)

    outstanding_rows = credit_base.filter(balance_due__gt=0).values("assigned_to_id").annotate(
        outstanding_credit=Coalesce(Sum("balance_due"), zero),
    )
    today = timezone.localdate()
    overdue_rows = credit_base.filter(balance_due__gt=0, due_date__lt=today).values("assigned_to_id").annotate(
        overdue_credit=Coalesce(Sum("balance_due"), zero),
    )

    metrics = {}
    for row in sales_rows:
        metrics[row["assigned_to_id"]] = {
            "sales_count_assigned": row["sales_count"],
            "sales_total_assigned": row["sales_total"],
        }
    for row in cost_rows:
        metrics.setdefault(row["sale__assigned_to_id"], {})["total_cost"] = row["cost_total"]
    for row in return_rows:
        entry = metrics.setdefault(row["sale_item__sale__assigned_to_id"], {})
        entry["refund_total"] = row["refund_total"]
        entry["return_cost_total"] = row["return_cost_total"]
    for row in credit_rows:
        metrics.setdefault(row["assigned_to_id"], {})["credit_issued"] = row["credit_issued"]
    for row in credit_recovered_rows:
        metrics.setdefault(row["sale__assigned_to_id"], {})["credit_recovered"] = row["credit_recovered"]
    for row in outstanding_rows:
        metrics.setdefault(row["assigned_to_id"], {})["outstanding_credit"] = row["outstanding_credit"]
    for row in overdue_rows:
        metrics.setdefault(row["assigned_to_id"], {})["overdue_credit"] = row["overdue_credit"]

    user_ids = [uid for uid in metrics.keys() if uid]
    users = {str(u.id): u for u in User.objects.filter(id__in=user_ids)}

    results = []
    for uid, data in metrics.items():
        user = users.get(str(uid)) if uid else None
        sales_total = money(data.get("sales_total_assigned", zero))
        cost_total = money(data.get("total_cost", zero))
        refund_total = money(data.get("refund_total", zero))
        return_cost_total = money(data.get("return_cost_total", zero))
        gross_profit = money((sales_total - cost_total) - (refund_total - return_cost_total))
        gross_margin = zero
        if sales_total > 0:
            gross_margin = money((gross_profit / sales_total) * Decimal("100"))

        results.append(
            {
                "user_id": str(uid) if uid else None,
                "user_name": _user_label(user) or "Unassigned",
                "role": (user.role if user else "unknown"),
                "sales_count_assigned": data.get("sales_count_assigned", 0) or 0,
                "sales_total_assigned": sales_total,
                "gross_profit_generated": gross_profit,
                "gross_margin_percent": gross_margin,
                "credit_issued": money(data.get("credit_issued", zero)),
                "credit_recovered": money(data.get("credit_recovered", zero)),
                "outstanding_credit": money(data.get("outstanding_credit", zero)),
                "overdue_credit": money(data.get("overdue_credit", zero)),
            }
        )

    results.sort(key=lambda item: Decimal(str(item.get("sales_total_assigned", "0"))), reverse=True)
    return results


def _delivery_performance(*, start_date=None, end_date=None, branch_id=None, user_id=None):
    zero = Decimal("0.00")
    orders_base = CustomerOrder.objects.select_related("sale", "sale__assigned_to")
    orders_base = orders_base.filter(sale__assigned_to__role="deliver_person")
    if branch_id:
        orders_base = orders_base.filter(sale__branch_id=branch_id)
    if user_id:
        orders_base = orders_base.filter(sale__assigned_to_id=user_id)

    assigned_orders_qs = _apply_order_created_range(orders_base, start_date, end_date)
    assigned_orders_rows = assigned_orders_qs.values("sale__assigned_to_id").annotate(
        assigned_orders_count=Count("id"),
    )

    delivered_qs = orders_base.filter(status="delivered")
    delivered_qs = _apply_order_updated_range(delivered_qs, start_date, end_date)
    delivered_rows = delivered_qs.values("sale__assigned_to_id").annotate(
        delivered_orders_count=Count("id"),
    )

    sales_base = Sale.objects.filter(status="completed", assigned_to__role="deliver_person")
    if branch_id:
        sales_base = sales_base.filter(branch_id=branch_id)
    sales_base = _apply_sale_date_range(sales_base, start_date, end_date)
    if user_id:
        sales_base = sales_base.filter(assigned_to_id=user_id)
    sales_rows = sales_base.values("assigned_to_id").annotate(
        assigned_sales_total=Coalesce(Sum("grand_total"), zero),
    )

    credit_base = sales_base.filter(is_credit_sale=True)
    outstanding_rows = credit_base.filter(balance_due__gt=0).values("assigned_to_id").annotate(
        outstanding_credit=Coalesce(Sum("balance_due"), zero),
    )
    today = timezone.localdate()
    overdue_rows = credit_base.filter(balance_due__gt=0, due_date__lt=today).values("assigned_to_id").annotate(
        overdue_credit=Coalesce(Sum("balance_due"), zero),
    )

    collections_qs = LedgerEntry.objects.filter(
        direction="in",
        entry_type__in=["sale_payment", "credit_payment"],
        sale__assigned_to__role="deliver_person",
    )
    if branch_id:
        collections_qs = collections_qs.filter(sale__branch_id=branch_id)
    collections_qs = _apply_entry_date_range(collections_qs, start_date, end_date)
    if user_id:
        collections_qs = collections_qs.filter(sale__assigned_to_id=user_id)
    collections_rows = collections_qs.values("sale__assigned_to_id").annotate(
        collections_total=Coalesce(Sum("amount"), zero),
    )

    metrics = {}
    for row in assigned_orders_rows:
        metrics[row["sale__assigned_to_id"]] = {
            "assigned_orders_count": row["assigned_orders_count"],
        }
    for row in delivered_rows:
        metrics.setdefault(row["sale__assigned_to_id"], {})["delivered_orders_count"] = row["delivered_orders_count"]
    for row in sales_rows:
        metrics.setdefault(row["assigned_to_id"], {})["assigned_sales_total"] = row["assigned_sales_total"]
    for row in outstanding_rows:
        metrics.setdefault(row["assigned_to_id"], {})["outstanding_credit"] = row["outstanding_credit"]
    for row in overdue_rows:
        metrics.setdefault(row["assigned_to_id"], {})["overdue_credit"] = row["overdue_credit"]
    for row in collections_rows:
        metrics.setdefault(row["sale__assigned_to_id"], {})["collections_total"] = row["collections_total"]

    user_ids = [uid for uid in metrics.keys() if uid]
    users = {str(u.id): u for u in User.objects.filter(id__in=user_ids)}

    results = []
    for uid, data in metrics.items():
        user = users.get(str(uid)) if uid else None
        results.append(
            {
                "user_id": str(uid) if uid else None,
                "user_name": _user_label(user) or "Unassigned",
                "role": (user.role if user else "unknown"),
                "assigned_orders_count": data.get("assigned_orders_count", 0) or 0,
                "delivered_orders_count": data.get("delivered_orders_count", 0) or 0,
                "assigned_sales_total": money(data.get("assigned_sales_total", zero)),
                "collections_processed": money(data.get("collections_total", zero)),
                "outstanding_credit": money(data.get("outstanding_credit", zero)),
                "overdue_credit": money(data.get("overdue_credit", zero)),
            }
        )

    results.sort(key=lambda item: Decimal(str(item.get("assigned_sales_total", "0"))), reverse=True)
    return results


def _route_performance(*, start_date=None, end_date=None, branch_id=None, route_id=None):
    zero = Decimal("0.00")
    sales_base = Sale.objects.filter(status="completed")
    if branch_id:
        sales_base = sales_base.filter(branch_id=branch_id)
    sales_base = _apply_sale_date_range(sales_base, start_date, end_date)
    if route_id:
        sales_base = sales_base.filter(
            Q(route_snapshot_id=route_id)
            | Q(route_snapshot__isnull=True, customer__route_id=route_id)
        )

    sales_rows = (
        # Prefer route snapshot when present; fall back to current customer route for legacy sales.
        sales_base.annotate(route_id=Coalesce("route_snapshot_id", "customer__route_id"))
        .values("route_id")
        .annotate(
            customers_count=Count("customer", distinct=True),
            sales_count=Count("id"),
            sales_total=Coalesce(Sum("grand_total"), zero),
        )
    )

    return_qs = SaleReturnItem.objects.select_related("sale_item", "sale_item__sale")
    if branch_id:
        return_qs = return_qs.filter(sale_item__sale__branch_id=branch_id)
    return_qs = _apply_return_date_range(return_qs, start_date, end_date)
    if route_id:
        return_qs = return_qs.filter(
            Q(sale_item__sale__route_snapshot_id=route_id)
            | Q(sale_item__sale__route_snapshot__isnull=True, sale_item__sale__customer__route_id=route_id)
        )
    return_rows = (
        return_qs.annotate(route_id=Coalesce("sale_item__sale__route_snapshot_id", "sale_item__sale__customer__route_id"))
        .values("route_id")
        .annotate(refund_total=Coalesce(Sum("refund_amount"), zero))
    )

    collections_qs = LedgerEntry.objects.filter(
        direction="in",
        entry_type__in=["sale_payment", "credit_payment"],
    )
    if branch_id:
        collections_qs = collections_qs.filter(sale__branch_id=branch_id)
    collections_qs = _apply_entry_date_range(collections_qs, start_date, end_date)
    if route_id:
        collections_qs = collections_qs.filter(
            Q(sale__route_snapshot_id=route_id) | Q(sale__route_snapshot__isnull=True, sale__customer__route_id=route_id)
        )
    collections_rows = (
        collections_qs.annotate(route_id=Coalesce("sale__route_snapshot_id", "sale__customer__route_id"))
        .values("route_id")
        .annotate(collections_total=Coalesce(Sum("amount"), zero))
    )

    credit_base = sales_base.filter(is_credit_sale=True)
    outstanding_rows = (
        credit_base.annotate(route_id=Coalesce("route_snapshot_id", "customer__route_id"))
        .filter(balance_due__gt=0)
        .values("route_id")
        .annotate(outstanding_credit=Coalesce(Sum("balance_due"), zero))
    )
    today = timezone.localdate()
    overdue_rows = (
        credit_base.annotate(route_id=Coalesce("route_snapshot_id", "customer__route_id"))
        .filter(balance_due__gt=0, due_date__lt=today)
        .values("route_id")
        .annotate(overdue_credit=Coalesce(Sum("balance_due"), zero))
    )

    delivered_qs = CustomerOrder.objects.select_related("sale")
    if branch_id:
        delivered_qs = delivered_qs.filter(sale__branch_id=branch_id)
    delivered_qs = delivered_qs.filter(status="delivered")
    delivered_qs = _apply_order_updated_range(delivered_qs, start_date, end_date)
    if route_id:
        delivered_qs = delivered_qs.filter(
            Q(sale__route_snapshot_id=route_id) | Q(sale__route_snapshot__isnull=True, sale__customer__route_id=route_id)
        )
    delivered_rows = (
        delivered_qs.annotate(route_id=Coalesce("sale__route_snapshot_id", "sale__customer__route_id"))
        .values("route_id")
        .annotate(delivered_orders_count=Count("id"))
    )

    metrics = {}
    for row in sales_rows:
        metrics[row["route_id"]] = {
            "customers_count": row["customers_count"],
            "sales_count": row["sales_count"],
            "sales_total": row["sales_total"],
        }
    for row in return_rows:
        metrics.setdefault(row["route_id"], {})["refund_total"] = row["refund_total"]
    for row in collections_rows:
        metrics.setdefault(row["route_id"], {})["collections_total"] = row["collections_total"]
    for row in outstanding_rows:
        metrics.setdefault(row["route_id"], {})["outstanding_credit"] = row["outstanding_credit"]
    for row in overdue_rows:
        metrics.setdefault(row["route_id"], {})["overdue_credit"] = row["overdue_credit"]
    for row in delivered_rows:
        metrics.setdefault(row["route_id"], {})["delivered_orders_count"] = row["delivered_orders_count"]

    route_ids = [rid for rid in metrics.keys() if rid]
    routes = {str(r.id): r for r in Route.objects.filter(id__in=route_ids)}

    results = []
    for rid, data in metrics.items():
        route = routes.get(str(rid)) if rid else None
        sales_total = money(data.get("sales_total", zero) - money(data.get("refund_total", zero)))
        sales_count = data.get("sales_count", 0) or 0
        avg_sale = money(sales_total / sales_count) if sales_count else zero
        results.append(
            {
                "route_id": str(rid) if rid else None,
                "route_name": route.name if route else "Unassigned",
                "customers_count": data.get("customers_count", 0) or 0,
                "sales_count": sales_count,
                "sales_total": sales_total,
                "collections_total": money(data.get("collections_total", zero)),
                "outstanding_credit": money(data.get("outstanding_credit", zero)),
                "overdue_credit": money(data.get("overdue_credit", zero)),
                "delivered_orders_count": data.get("delivered_orders_count", 0) or 0,
                "average_sale_value": avg_sale,
            }
        )

    results.sort(key=lambda item: Decimal(str(item.get("sales_total", "0"))), reverse=True)
    return results


def _csv_response(filename, rows):
    resp = HttpResponse("\n".join(rows), content_type="text/csv")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


class CashierPerformanceView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        user_id = request.query_params.get("user_id")
        results = _cashier_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user_id=user_id,
        )
        return Response({"results": results})


class PerformanceUserListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        role = _normalize_role(request.query_params.get("role"))
        branch_id = request.query_params.get("branch")
        is_active_param = request.query_params.get("is_active")
        is_active = None
        if is_active_param is not None:
            is_active = str(is_active_param).strip().lower() not in ("0", "false", "no")
        data = _performance_user_list(
            role=role or None,
            branch_id=branch_id or None,
            is_active=is_active,
        )
        return Response(data)


class SalespersonPerformanceView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        user_id = request.query_params.get("user_id")
        results = _salesperson_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user_id=user_id,
        )
        return Response({"results": results})


class DeliveryPerformanceView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        user_id = request.query_params.get("user_id")
        results = _delivery_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user_id=user_id,
        )
        return Response({"results": results})


class RoutePerformanceView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        route_id = request.query_params.get("route_id")
        results = _route_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            route_id=route_id,
        )
        return Response({"results": results})


class CashierPerformanceExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        user_id = request.query_params.get("user_id")
        rows = ["user, sales_count, sales_total, collections, refunds_count, refunds_total, average_sale"]
        results = _cashier_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user_id=user_id,
        )
        for row in results:
            rows.append(
                f"{row['user_name']},{row['sales_count_processed']},{row['sales_total_processed']},"
                f"{row['collections_processed']},{row['refunds_processed_count']},{row['refunds_total']},"
                f"{row['average_sale_value']}"
            )
        return _csv_response("cashier_performance.csv", rows)


class SalespersonPerformanceExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        user_id = request.query_params.get("user_id")
        rows = ["user, sales_count, sales_total, gross_profit, gross_margin_percent, credit_issued, credit_recovered, outstanding_credit, overdue_credit"]
        results = _salesperson_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user_id=user_id,
        )
        for row in results:
            rows.append(
                f"{row['user_name']},{row['sales_count_assigned']},{row['sales_total_assigned']},"
                f"{row['gross_profit_generated']},{row['gross_margin_percent']},{row['credit_issued']},"
                f"{row['credit_recovered']},{row['outstanding_credit']},{row['overdue_credit']}"
            )
        return _csv_response("salesperson_performance.csv", rows)


class DeliveryPerformanceExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        user_id = request.query_params.get("user_id")
        rows = ["user, assigned_orders, delivered_orders, assigned_sales_total, collections, outstanding_credit, overdue_credit"]
        results = _delivery_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user_id=user_id,
        )
        for row in results:
            rows.append(
                f"{row['user_name']},{row['assigned_orders_count']},{row['delivered_orders_count']},"
                f"{row['assigned_sales_total']},{row['collections_processed']},{row['outstanding_credit']},"
                f"{row['overdue_credit']}"
            )
        return _csv_response("delivery_performance.csv", rows)


class RoutePerformanceExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_date, end_date, err = _extract_date_range(request)
        if err:
            return Response({"detail": err}, status=400)
        branch_id = request.query_params.get("branch")
        route_id = request.query_params.get("route_id")
        rows = ["route, customers, sales_count, sales_total, collections, outstanding_credit, overdue_credit, delivered_orders, average_sale"]
        results = _route_performance(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            route_id=route_id,
        )
        for row in results:
            rows.append(
                f"{row['route_name']},{row['customers_count']},{row['sales_count']},{row['sales_total']},"
                f"{row['collections_total']},{row['outstanding_credit']},{row['overdue_credit']},"
                f"{row['delivered_orders_count']},{row['average_sale_value']}"
            )
        return _csv_response("route_performance.csv", rows)
