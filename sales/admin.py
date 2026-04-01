from django.contrib import admin
from core.admin import BaseModelAdmin, BaseTabularInline
from .models import Sale, SaleItem, CustomerOrder, LedgerEntry


class SaleItemInline(BaseTabularInline):
    model = SaleItem
    extra = 0
    raw_id_fields = ("product",)


@admin.register(Sale)
class SaleAdmin(BaseModelAdmin):
    list_display = ("id", "branch", "customer", "sale_type", "status", "grand_total", "amount_paid", "balance", "sale_date")
    list_filter = ("sale_type", "status", "branch", "sale_date")
    search_fields = ("id", "customer__name")
    date_hierarchy = "sale_date"
    inlines = [SaleItemInline]
    raw_id_fields = ("branch", "customer")


@admin.register(SaleItem)
class SaleItemAdmin(BaseModelAdmin):
    list_display = ("sale", "product", "quantity", "unit_price", "total_price")
    search_fields = ("sale__id", "product__name", "product__sku")
    raw_id_fields = ("sale", "product")


@admin.register(CustomerOrder)
class CustomerOrderAdmin(BaseModelAdmin):
    list_display = ("id", "sale", "status", "placed_by", "created_at", "updated_at")
    list_filter = ("status", "created_at")
    search_fields = ("id", "sale__id", "sale__customer__name")
    raw_id_fields = ("sale", "placed_by")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(BaseModelAdmin):
    list_display = ("id", "entry_type", "direction", "amount", "customer", "sale", "payment", "actor", "created_at")
    list_filter = ("entry_type", "direction", "created_at")
    search_fields = ("id", "sale__id", "payment__id", "customer__name", "actor__username")
    raw_id_fields = ("sale", "payment", "customer", "actor")
