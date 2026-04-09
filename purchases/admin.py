from django.contrib import admin
from core.admin import BaseModelAdmin, BaseTabularInline
from .models import PurchaseOrder, PurchaseOrderLine


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
