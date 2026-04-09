from decimal import Decimal, InvalidOperation
from django.db import transaction, models
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission
from core.pagination import StandardLimitOffsetPagination
from inventory.models import Product, Inventory, StockMovement
from suppliers.models import Supplier
from business.models import Branch
from .models import PurchaseOrder, PurchaseOrderLine


def _parse_decimal(value, *, field):
    if value is None or str(value).strip() == "":
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"Invalid {field}")


def _parse_int(value, *, field):
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(Decimal(str(value).strip()))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"Invalid {field}")


def _parse_bool(value):
    if value is None or str(value).strip() == "":
        return None
    val = str(value).strip().lower()
    if val in ("1", "true", "yes", "y", "on"):
        return True
    if val in ("0", "false", "no", "n", "off"):
        return False
    return None


def _generate_po_number():
    ts = timezone.now().strftime("%Y%m%d")
    suffix = str(timezone.now().timestamp()).split(".")[0][-5:]
    return f"PO-{ts}-{suffix}"


def _serialize_po(po):
    return {
        "id": str(po.id),
        "po_number": po.po_number,
        "supplier": {
            "id": str(po.supplier_id),
            "name": po.supplier.name,
        },
        "branch": {
            "id": str(po.branch_id),
            "name": po.branch.branch_name if po.branch else None,
        },
        "status": po.status,
        "ordered_at": po.ordered_at.isoformat() if po.ordered_at else None,
        "expected_date": po.expected_date.isoformat() if po.expected_date else None,
        "notes": po.notes,
        "created_at": po.created_at.isoformat() if po.created_at else None,
        "updated_at": po.updated_at.isoformat() if po.updated_at else None,
    }


def _serialize_line(line):
    return {
        "id": str(line.id),
        "product": {
            "id": str(line.product_id),
            "name": line.product.name,
            "sku": line.product.sku,
        },
        "ordered_quantity": line.ordered_quantity,
        "received_quantity": line.received_quantity,
        "remaining_quantity": max(0, line.ordered_quantity - line.received_quantity),
        "unit_cost": str(line.unit_cost) if line.unit_cost is not None else None,
        "notes": line.notes,
    }


def _apply_purchase_update(po, data):
    errors = {}

    supplier_id = data.get("supplier_id") or data.get("supplier") or po.supplier_id
    branch_id = data.get("branch_id") or data.get("branch") or po.branch_id

    supplier = Supplier.all_objects.filter(id=supplier_id).first() if supplier_id else None
    if not supplier:
        errors["supplier"] = "Supplier is required."

    branch = Branch.objects.filter(id=branch_id).first() if branch_id else None
    if not branch:
        errors["branch"] = "Branch is required."

    if errors:
        return None, errors

    po.supplier = supplier
    po.branch = branch
    po.expected_date = data.get("expected_date") or None
    po.notes = str(data.get("notes") or "").strip()
    po.save()
    return po, None


class PurchaseOrderListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        status = (request.query_params.get("status") or "").strip().lower()
        supplier_id = request.query_params.get("supplier")
        branch_id = request.query_params.get("branch")

        qs = PurchaseOrder.objects.select_related("supplier", "branch")
        if query:
            qs = qs.filter(
                Q(po_number__icontains=query)
                | Q(supplier__name__icontains=query)
            )
        if status:
            qs = qs.filter(status=status)
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs

        data = []
        for po in page:
            line_stats = po.lines.aggregate(
                ordered=models.Sum("ordered_quantity"),
                received=models.Sum("received_quantity"),
            )
            data.append({
                **_serialize_po(po),
                "ordered_quantity": int(line_stats["ordered"] or 0),
                "received_quantity": int(line_stats["received"] or 0),
                "line_count": po.lines.count(),
            })
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class PurchaseOrderCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request):
        data = request.data or {}
        errors = {}

        supplier_id = data.get("supplier_id") or data.get("supplier")
        branch_id = data.get("branch_id") or data.get("branch")

        supplier = Supplier.all_objects.filter(id=supplier_id).first() if supplier_id else None
        if not supplier:
            errors["supplier"] = "Supplier is required."

        branch = Branch.objects.filter(id=branch_id).first() if branch_id else None
        if not branch:
            errors["branch"] = "Branch is required."

        expected_date = data.get("expected_date") or None

        if errors:
            return Response(errors, status=400)

        po_number = _generate_po_number()
        po = PurchaseOrder.objects.create(
            po_number=po_number,
            supplier=supplier,
            branch=branch,
            expected_date=expected_date or None,
            notes=str(data.get("notes") or "").strip(),
            status="draft",
        )
        return Response({"id": str(po.id), "po_number": po.po_number}, status=201)


class PurchaseOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, purchase_id):
        po = get_object_or_404(PurchaseOrder.objects.select_related("supplier", "branch"), id=purchase_id)
        lines = po.lines.select_related("product").all()
        data = _serialize_po(po)
        data["lines"] = [_serialize_line(line) for line in lines]
        return Response(data)

    def put(self, request, purchase_id):
        po = get_object_or_404(PurchaseOrder.objects.select_related("supplier", "branch"), id=purchase_id)
        if po.status in ("received", "cancelled"):
            return Response({"detail": "Cannot edit a completed or cancelled purchase order."}, status=400)
        data = request.data or {}
        po, errors = _apply_purchase_update(po, data)
        if errors:
            return Response(errors, status=400)
        return Response({"id": str(po.id)}, status=200)


class PurchaseOrderUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, purchase_id):
        po = get_object_or_404(PurchaseOrder.objects.select_related("supplier", "branch"), id=purchase_id)
        if po.status in ("received", "cancelled"):
            return Response({"detail": "Cannot edit a completed or cancelled purchase order."}, status=400)

        data = request.data or {}
        po, errors = _apply_purchase_update(po, data)
        if errors:
            return Response(errors, status=400)
        return Response({"id": str(po.id)}, status=200)


class PurchaseOrderLineAddView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, purchase_id):
        po = get_object_or_404(PurchaseOrder, id=purchase_id)
        if po.status != "draft":
            return Response({"detail": "Lines can only be edited while draft."}, status=400)

        data = request.data or {}
        errors = {}

        product_id = data.get("product_id") or data.get("product")
        product = Product.objects.filter(id=product_id).first() if product_id else None
        if not product:
            errors["product"] = "Product not found."

        try:
            ordered_quantity = _parse_int(data.get("ordered_quantity"), field="ordered_quantity")
        except ValueError as exc:
            errors["ordered_quantity"] = str(exc)
            ordered_quantity = None

        try:
            unit_cost = _parse_decimal(data.get("unit_cost"), field="unit_cost")
        except ValueError as exc:
            errors["unit_cost"] = str(exc)
            unit_cost = None

        if ordered_quantity is None or ordered_quantity <= 0:
            errors["ordered_quantity"] = "Ordered quantity must be greater than zero."

        if errors:
            return Response(errors, status=400)

        if PurchaseOrderLine.objects.filter(purchase_order=po, product=product).exists():
            return Response({"detail": "Product already added to this PO."}, status=400)

        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=product,
            ordered_quantity=ordered_quantity,
            unit_cost=unit_cost,
            notes=str(data.get("notes") or "").strip(),
        )
        return Response({"id": str(line.id)}, status=201)


class PurchaseOrderLineUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, purchase_id, line_id):
        po = get_object_or_404(PurchaseOrder, id=purchase_id)
        if po.status != "draft":
            return Response({"detail": "Lines can only be edited while draft."}, status=400)

        line = get_object_or_404(PurchaseOrderLine, id=line_id, purchase_order=po)
        data = request.data or {}
        errors = {}

        try:
            ordered_quantity = _parse_int(data.get("ordered_quantity"), field="ordered_quantity")
        except ValueError as exc:
            errors["ordered_quantity"] = str(exc)
            ordered_quantity = None

        try:
            unit_cost = _parse_decimal(data.get("unit_cost"), field="unit_cost")
        except ValueError as exc:
            errors["unit_cost"] = str(exc)
            unit_cost = None

        if ordered_quantity is None or ordered_quantity <= 0:
            errors["ordered_quantity"] = "Ordered quantity must be greater than zero."
        if line.received_quantity and ordered_quantity is not None and ordered_quantity < line.received_quantity:
            errors["ordered_quantity"] = "Cannot set ordered quantity below received quantity."

        if errors:
            return Response(errors, status=400)

        line.ordered_quantity = ordered_quantity
        line.unit_cost = unit_cost
        line.notes = str(data.get("notes") or "").strip()
        line.save()
        return Response({"id": str(line.id)}, status=200)


class PurchaseOrderLineDeleteView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def delete(self, request, purchase_id, line_id):
        po = get_object_or_404(PurchaseOrder, id=purchase_id)
        if po.status != "draft":
            return Response({"detail": "Lines can only be edited while draft."}, status=400)
        line = get_object_or_404(PurchaseOrderLine, id=line_id, purchase_order=po)
        if line.received_quantity > 0:
            return Response({"detail": "Cannot remove a line with received stock."}, status=400)
        line.delete()
        return Response(status=204)


class PurchaseOrderMarkOrderedView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, purchase_id):
        po = get_object_or_404(PurchaseOrder, id=purchase_id)
        if po.status != "draft":
            return Response({"detail": "Only draft purchase orders can be marked ordered."}, status=400)
        if not po.lines.exists():
            return Response({"detail": "Add at least one line before ordering."}, status=400)
        po.mark_ordered()
        po.save()
        return Response({"id": str(po.id), "status": po.status}, status=200)


class PurchaseOrderReceiveView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, purchase_id):
        data = request.data or {}
        lines_payload = data.get("lines") or []
        if not isinstance(lines_payload, list) or not lines_payload:
            return Response({"detail": "Line receipts are required."}, status=400)

        with transaction.atomic():
            po = PurchaseOrder.objects.select_for_update().select_related("branch").get(id=purchase_id)
            if po.status not in ("ordered", "partial"):
                return Response({"detail": "Only ordered purchase orders can be received."}, status=400)

            line_map = {}
            for entry in lines_payload:
                line_id = entry.get("line_id") or entry.get("id")
                if not line_id:
                    continue
                line_map[str(line_id)] = entry

            lines = list(PurchaseOrderLine.objects.select_for_update().filter(purchase_order=po))
            if not lines:
                return Response({"detail": "No lines found for this PO."}, status=400)

            total_received = 0
            for line in lines:
                entry = line_map.get(str(line.id))
                if not entry:
                    continue
                try:
                    qty = _parse_int(entry.get("received_quantity"), field="received_quantity")
                except ValueError as exc:
                    return Response({"received_quantity": str(exc)}, status=400)
                if qty is None or qty <= 0:
                    continue
                remaining = line.ordered_quantity - line.received_quantity
                if qty > remaining:
                    return Response({"detail": f"Cannot receive more than remaining for {line.product.name}."}, status=400)

                inventory, _ = Inventory.objects.select_for_update().get_or_create(
                    product=line.product,
                    branch=po.branch,
                    defaults={"quantity": 0},
                )
                previous_qty = inventory.quantity
                inventory.quantity = previous_qty + qty
                inventory.save()

                StockMovement.objects.create(
                    inventory=inventory,
                    product=line.product,
                    branch=po.branch,
                    movement_type="purchase",
                    quantity_change=qty,
                    previous_quantity=previous_qty,
                    new_quantity=inventory.quantity,
                    reference=po.po_number,
                    notes="PO receipt",
                    is_active=True,
                )

                line.received_quantity += qty
                line.save()
                total_received += qty

            po.status = po.compute_status()
            po.save()

        return Response({"id": str(po.id), "status": po.status}, status=200)
