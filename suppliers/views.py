from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.shortcuts import get_object_or_404
from django.db import models
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission
from core.pagination import StandardLimitOffsetPagination
from .models import Supplier
from inventory.models import ProductSupplier
from purchases.models import SupplierBill, SupplierLedgerEntry
from .serializers import SupplierSerializer


def _parse_bool(value):
    if value is None or str(value).strip() == "":
        return None
    val = str(value).strip().lower()
    if val in ("1", "true", "yes", "y", "on"):
        return True
    if val in ("0", "false", "no", "n", "off"):
        return False
    return None


class SupplierListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        include_inactive = request.query_params.get("include_inactive") == "1"
        user = request.user
        role = (getattr(user, "role", "") or "").strip().lower()
        can_view_inactive = getattr(user, "is_superuser", False) or role in ("admin", "supervisor")

        qs = Supplier.all_objects.all() if (include_inactive and can_view_inactive) else Supplier.objects.all()

        if query:
            qs = qs.filter(
                models.Q(name__icontains=query)
                | models.Q(phone__icontains=query)
                | models.Q(email__icontains=query)
                | models.Q(contact_person__icontains=query)
            )

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs

        data = SupplierSerializer(page, many=True).data
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class SupplierCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request):
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        if not name:
            errors["name"] = "Name is required."

        email = str(data.get("email") or "").strip()
        if email:
            try:
                validate_email(email)
            except ValidationError:
                errors["email"] = "Enter a valid email address."

        if errors:
            return Response(errors, status=400)

        serializer = SupplierSerializer(data={
            "name": name,
            "phone": str(data.get("phone") or "").strip(),
            "email": email,
            "contact_person": str(data.get("contact_person") or "").strip(),
            "address": str(data.get("address") or "").strip(),
            "notes": str(data.get("notes") or "").strip(),
            "is_active": True if _parse_bool(data.get("is_active")) is None else _parse_bool(data.get("is_active")),
        })
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()
        return Response({"id": str(supplier.id)}, status=201)


class SupplierUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, supplier_id):
        supplier = get_object_or_404(Supplier.all_objects, id=supplier_id)
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        if not name:
            errors["name"] = "Name is required."

        email = str(data.get("email") or "").strip()
        if email:
            try:
                validate_email(email)
            except ValidationError:
                errors["email"] = "Enter a valid email address."

        if errors:
            return Response(errors, status=400)

        serializer = SupplierSerializer(
            supplier,
            data={
                "name": name,
                "phone": str(data.get("phone") or "").strip(),
                "email": email,
                "contact_person": str(data.get("contact_person") or "").strip(),
                "address": str(data.get("address") or "").strip(),
                "notes": str(data.get("notes") or "").strip(),
                "is_active": supplier.is_active if _parse_bool(data.get("is_active")) is None else _parse_bool(data.get("is_active")),
            },
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"id": str(supplier.id)}, status=200)


class SupplierProductsView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, supplier_id):
        supplier = get_object_or_404(Supplier.all_objects, id=supplier_id)
        links = ProductSupplier.objects.filter(supplier=supplier).select_related("product").order_by("-is_primary", "product__name")
        data = [
            {
                "id": str(link.id),
                "product": {
                    "id": str(link.product_id),
                    "name": link.product.name,
                    "sku": link.product.sku,
                },
                "supplier_sku": link.supplier_sku,
                "supplier_price": str(link.supplier_price) if link.supplier_price is not None else None,
                "is_primary": link.is_primary,
                "notes": link.notes,
            }
            for link in links
        ]
        return Response(data)


class SupplierLedgerView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, supplier_id):
        supplier = get_object_or_404(Supplier.all_objects, id=supplier_id)
        branch_id = request.query_params.get("branch")
        entry_type = (request.query_params.get("entry_type") or "").strip().lower()

        qs = SupplierLedgerEntry.objects.select_related("branch", "bill", "created_by").filter(supplier=supplier)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if entry_type:
            qs = qs.filter(entry_type=entry_type)

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs

        data = []
        for entry in page:
            user = entry.created_by
            if user:
                name = (getattr(user, "get_full_name", None) or (lambda: ""))()
                display = name or getattr(user, "username", "") or getattr(user, "email", "") or "—"
            else:
                display = "—"
            data.append({
                "id": str(entry.id),
                "entry_type": entry.entry_type,
                "direction": entry.direction,
                "amount": str(entry.amount),
                "reference": entry.reference,
                "bill": {
                    "id": str(entry.bill_id) if entry.bill_id else None,
                    "bill_number": entry.bill.bill_number if entry.bill else None,
                },
                "branch": {
                    "id": str(entry.branch_id),
                    "name": entry.branch.branch_name if entry.branch else None,
                },
                "notes": entry.notes,
                "created_at": entry.created_at.isoformat() if entry.created_at else None,
                "created_by": display,
            })
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class SupplierBalancesView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, supplier_id):
        supplier = get_object_or_404(Supplier.all_objects, id=supplier_id)
        branch_id = request.query_params.get("branch")

        qs = SupplierBill.objects.select_related("branch").filter(supplier=supplier).exclude(status="cancelled")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        open_qs = qs.filter(status__in=["open", "partial"])

        totals = qs.aggregate(
            total_billed=models.Sum("total_amount"),
            total_paid=models.Sum("amount_paid"),
        )
        open_totals = open_qs.aggregate(
            outstanding=models.Sum("balance_due"),
        )

        last_bill = qs.order_by("-bill_date").first()

        data = {
            "supplier": {
                "id": str(supplier.id),
                "name": supplier.name,
            },
            "branch_id": branch_id,
            "outstanding_balance": str(open_totals["outstanding"] or 0),
            "open_bills_count": open_qs.count(),
            "total_bills_count": qs.count(),
            "total_billed": str(totals["total_billed"] or 0),
            "total_paid": str(totals["total_paid"] or 0),
            "last_bill_date": last_bill.bill_date.isoformat() if last_bill and last_bill.bill_date else None,
        }
        return Response(data)
