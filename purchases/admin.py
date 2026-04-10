from django.contrib import admin
from core.admin import BaseModelAdmin, BaseTabularInline
from .models import (
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierBill,
    SupplierBillLine,
    SupplierLedgerEntry,
)


class PurchaseOrderLineInline(BaseTabularInline):
    model = PurchaseOrderLine
    extra = 0
    fields = ("product", "ordered_quantity", "received_quantity", "unit_cost", "notes", "is_active")


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(BaseModelAdmin):
    list_display = ("po_number", "supplier", "branch", "status", "ordered_at", "expected_date", "created_at")
    list_filter = ("status", "supplier", "branch")
    search_fields = ("po_number", "supplier__name")
    inlines = [PurchaseOrderLineInline]


@admin.register(PurchaseOrderLine)
class PurchaseOrderLineAdmin(BaseModelAdmin):
    list_display = ("purchase_order", "product", "ordered_quantity", "received_quantity", "unit_cost")
    list_filter = ("purchase_order__status",)
    search_fields = ("purchase_order__po_number", "product__name", "product__sku")


class SupplierBillLineInline(BaseTabularInline):
    model = SupplierBillLine
    extra = 0
    fields = ("product", "description", "quantity", "unit_cost", "line_total")


@admin.register(SupplierBill)
class SupplierBillAdmin(BaseModelAdmin):
    list_display = ("bill_number", "supplier", "branch", "status", "total_amount", "amount_paid", "balance_due", "bill_date")
    list_filter = ("status", "supplier", "branch")
    search_fields = ("bill_number", "supplier__name", "purchase_order__po_number")
    inlines = [SupplierBillLineInline]


@admin.register(SupplierBillLine)
class SupplierBillLineAdmin(BaseModelAdmin):
    list_display = ("supplier_bill", "product", "quantity", "unit_cost", "line_total")
    search_fields = ("supplier_bill__bill_number", "product__name", "product__sku")


@admin.register(SupplierLedgerEntry)
class SupplierLedgerEntryAdmin(BaseModelAdmin):
    list_display = ("supplier", "branch", "entry_type", "direction", "amount", "reference", "created_at")
    list_filter = ("entry_type", "direction", "branch")
    search_fields = ("supplier__name", "reference")
