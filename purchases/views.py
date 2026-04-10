from decimal import Decimal, InvalidOperation
from datetime import date
from django.db import transaction, models, IntegrityError
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
from .models import (
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierBill,
    SupplierBillLine,
    SupplierLedgerEntry,
)


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


def _parse_date(value, *, field):
    if value is None or str(value).strip() == "":
        return None
    try:
        return date.fromisoformat(str(value).strip())
    except (ValueError, TypeError):
        raise ValueError(f"Invalid {field}. Use YYYY-MM-DD.")


def _generate_po_number():
    ts = timezone.now().strftime("%Y%m%d")
    suffix = str(timezone.now().timestamp()).split(".")[0][-5:]
    return f"PO-{ts}-{suffix}"


def _generate_bill_number():
    ts = timezone.now().strftime("%Y%m%d")
    suffix = str(timezone.now().timestamp()).split(".")[0][-5:]
    return f"BILL-{ts}-{suffix}"


def _serialize_po(po):
    bill = getattr(po, "supplier_bill", None)
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
        "bill_id": str(bill.id) if bill else None,
        "bill_status": bill.status if bill else None,
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


def _serialize_bill_line(line):
    return {
        "id": str(line.id),
        "product": {
            "id": str(line.product_id) if line.product_id else None,
            "name": line.product.name if line.product else None,
            "sku": line.product.sku if line.product else None,
        },
        "description": line.description,
        "quantity": line.quantity,
        "unit_cost": str(line.unit_cost) if line.unit_cost is not None else None,
        "line_total": str(line.line_total) if line.line_total is not None else None,
    }


def _serialize_bill(bill):
    return {
        "id": str(bill.id),
        "bill_number": bill.bill_number,
        "supplier": {
            "id": str(bill.supplier_id),
            "name": bill.supplier.name,
        },
        "branch": {
            "id": str(bill.branch_id),
            "name": bill.branch.branch_name if bill.branch else None,
        },
        "purchase_order": {
            "id": str(bill.purchase_order_id),
            "po_number": bill.purchase_order.po_number if bill.purchase_order else None,
        },
        "status": bill.status,
        "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
        "due_date": bill.due_date.isoformat() if bill.due_date else None,
        "subtotal": str(bill.subtotal) if bill.subtotal is not None else None,
        "tax_amount": str(bill.tax_amount) if bill.tax_amount is not None else None,
        "total_amount": str(bill.total_amount) if bill.total_amount is not None else None,
        "amount_paid": str(bill.amount_paid) if bill.amount_paid is not None else None,
        "balance_due": str(bill.balance_due) if bill.balance_due is not None else None,
        "notes": bill.notes,
        "created_at": bill.created_at.isoformat() if bill.created_at else None,
        "updated_at": bill.updated_at.isoformat() if bill.updated_at else None,
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

        qs = PurchaseOrder.objects.select_related("supplier", "branch", "supplier_bill")
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
        po = get_object_or_404(
            PurchaseOrder.objects.select_related("supplier", "branch", "supplier_bill"),
            id=purchase_id,
        )
        lines = po.lines.select_related("product").all()
        data = _serialize_po(po)
        line_stats = po.lines.aggregate(
            ordered=models.Sum("ordered_quantity"),
            received=models.Sum("received_quantity"),
        )
        data["ordered_quantity"] = int(line_stats["ordered"] or 0)
        data["received_quantity"] = int(line_stats["received"] or 0)
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
            po = get_object_or_404(
                PurchaseOrder.objects.select_for_update().select_related("branch"),
                id=purchase_id,
            )
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


class PurchaseOrderReceiptsView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, purchase_id):
        po = get_object_or_404(PurchaseOrder.objects.select_related("branch"), id=purchase_id)
        movements = (
            StockMovement.objects.select_related("product", "branch", "created_by")
            .filter(movement_type="purchase", reference=po.po_number, branch=po.branch)
            .order_by("-created_at")
        )
        data = []
        for entry in movements:
            user = entry.created_by
            if user:
                name = (getattr(user, "get_full_name", None) or (lambda: ""))()
                display = name or getattr(user, "username", "") or getattr(user, "email", "") or "—"
            else:
                display = "—"
            data.append({
                "id": str(entry.id),
                "po_number": po.po_number,
                "product_id": str(entry.product_id),
                "product_name": entry.product.name,
                "product_sku": entry.product.sku,
                "quantity": entry.quantity_change,
                "branch_id": str(entry.branch_id),
                "branch_name": entry.branch.branch_name if entry.branch else None,
                "received_at": entry.created_at.isoformat() if entry.created_at else None,
                "received_by": display,
            })
        return Response(data)


class PurchaseOrderCancelView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, purchase_id):
        with transaction.atomic():
            po = get_object_or_404(PurchaseOrder.objects.select_for_update(), id=purchase_id)
            if po.status not in ("draft", "ordered"):
                return Response({"detail": "Only draft or ordered purchase orders can be cancelled."}, status=400)
            if po.lines.filter(received_quantity__gt=0).exists():
                return Response({"detail": "Cannot cancel a purchase order with received stock."}, status=400)
            po.status = "cancelled"
            po.save()
        return Response({"id": str(po.id), "status": po.status}, status=200)


class PurchaseOrderCreateBillView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, purchase_id):
        data = request.data or {}
        with transaction.atomic():
            po = get_object_or_404(
                PurchaseOrder.objects.select_for_update().select_related("supplier", "branch"),
                id=purchase_id,
            )
            if po.status != "received":
                return Response({"detail": "Bills can only be created from received purchase orders."}, status=400)
            if SupplierBill.objects.filter(purchase_order=po).exists():
                return Response({"detail": "A bill already exists for this purchase order."}, status=400)

            lines = list(po.lines.select_related("product").all())
            if not lines:
                return Response({"detail": "Purchase order has no lines."}, status=400)

            try:
                tax_amount = _parse_decimal(data.get("tax_amount"), field="tax_amount") or Decimal("0")
            except ValueError as exc:
                return Response({"tax_amount": str(exc)}, status=400)
            try:
                bill_date = _parse_date(data.get("bill_date"), field="bill_date") or timezone.now().date()
            except ValueError as exc:
                return Response({"bill_date": str(exc)}, status=400)
            try:
                due_date = _parse_date(data.get("due_date"), field="due_date")
            except ValueError as exc:
                return Response({"due_date": str(exc)}, status=400)
            notes = str(data.get("notes") or "").strip()

            subtotal = Decimal("0")
            bill_lines = []
            for line in lines:
                qty = int(line.received_quantity or 0)
                if qty <= 0:
                    continue
                unit_cost = line.unit_cost if line.unit_cost is not None else Decimal("0")
                line_total = unit_cost * Decimal(qty)
                subtotal += line_total
                bill_lines.append(SupplierBillLine(
                    supplier_bill=None,
                    product=line.product,
                    purchase_order_line=line,
                    description=line.product.name if line.product else "",
                    quantity=qty,
                    unit_cost=unit_cost,
                    line_total=line_total,
                ))

            if not bill_lines:
                return Response({"detail": "No received quantities to bill."}, status=400)

            total_amount = subtotal + tax_amount
            amount_paid = Decimal("0")
            balance_due = total_amount - amount_paid

            try:
                bill = SupplierBill.objects.create(
                    bill_number=_generate_bill_number(),
                    supplier=po.supplier,
                    branch=po.branch,
                    purchase_order=po,
                    bill_date=bill_date,
                    due_date=due_date,
                    status="open",
                    subtotal=subtotal,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    amount_paid=amount_paid,
                    balance_due=balance_due,
                    notes=notes,
                )
            except IntegrityError:
                return Response({"detail": "Bill already exists for this purchase order."}, status=400)

            for line in bill_lines:
                line.supplier_bill = bill
            SupplierBillLine.objects.bulk_create(bill_lines)

            SupplierLedgerEntry.objects.create(
                supplier=po.supplier,
                branch=po.branch,
                entry_type="supplier_bill",
                direction="out",
                amount=total_amount,
                reference=bill.bill_number,
                bill=bill,
                notes=f"Bill created from PO {po.po_number}",
            )

        return Response({"id": str(bill.id), "bill_number": bill.bill_number}, status=201)


class SupplierBillListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        status = (request.query_params.get("status") or "").strip().lower()
        supplier_id = request.query_params.get("supplier")
        branch_id = request.query_params.get("branch")

        qs = SupplierBill.objects.select_related("supplier", "branch", "purchase_order")
        if query:
            qs = qs.filter(
                Q(bill_number__icontains=query)
                | Q(supplier__name__icontains=query)
                | Q(purchase_order__po_number__icontains=query)
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

        data = [_serialize_bill(bill) for bill in page]
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class SupplierBillDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, bill_id):
        bill = get_object_or_404(
            SupplierBill.objects.select_related("supplier", "branch", "purchase_order"),
            id=bill_id,
        )
        data = _serialize_bill(bill)
        lines = bill.lines.select_related("product").all()
        data["lines"] = [_serialize_bill_line(line) for line in lines]
        return Response(data)

    def put(self, request, bill_id):
        bill = get_object_or_404(SupplierBill.objects.select_related("supplier", "branch"), id=bill_id)
        if bill.status in ("cancelled", "paid"):
            return Response({"detail": "Cannot edit a cancelled or paid bill."}, status=400)
        data = request.data or {}
        bill.bill_date = data.get("bill_date") or bill.bill_date
        bill.due_date = data.get("due_date") or bill.due_date
        bill.notes = str(data.get("notes") or "").strip()

        try:
            tax_amount = _parse_decimal(data.get("tax_amount"), field="tax_amount")
        except ValueError as exc:
            return Response({"tax_amount": str(exc)}, status=400)
        if tax_amount is not None:
            bill.tax_amount = tax_amount

        subtotal = bill.lines.aggregate(total=models.Sum("line_total"))["total"] or Decimal("0")
        bill.subtotal = subtotal
        bill.total_amount = subtotal + (bill.tax_amount or Decimal("0"))
        bill.balance_due = bill.total_amount - (bill.amount_paid or Decimal("0"))
        bill.save()
        return Response({"id": str(bill.id)}, status=200)


class SupplierBillCancelView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, bill_id):
        with transaction.atomic():
            bill = get_object_or_404(SupplierBill.objects.select_for_update(), id=bill_id)
            if bill.status == "cancelled":
                return Response({"detail": "Bill is already cancelled."}, status=400)
            if bill.amount_paid and bill.amount_paid > 0:
                return Response({"detail": "Cannot cancel a bill with payments."}, status=400)
            bill.status = "cancelled"
            bill.save()
        return Response({"id": str(bill.id), "status": bill.status}, status=200)
