from django.contrib import admin
from core.admin import BaseModelAdmin, BaseTabularInline
from .forms import ProductUnitForm, ProductUnitInlineFormSet
from .models import Category, Product, ProductUnit, Inventory, StockMovement


@admin.register(Category)
class CategoryAdmin(BaseModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)
    list_filter = ("is_active",)


class ProductUnitInline(BaseTabularInline):
    model = ProductUnit
    extra = 0
    form = ProductUnitForm
    formset = ProductUnitInlineFormSet
    fields = (
        "unit_name",
        "unit_code",
        "conversion_to_base_unit",
        "is_base_unit",
        "cost_price",
        "retail_price",
        "wholesale_price",
        "wholesale_threshold",
        "is_active",
    )


@admin.register(Product)
class ProductAdmin(BaseModelAdmin):
    list_display = (
        "name",
        "sku",
        "category",
        "retail_price",
        "wholesale_price",
        "wholesale_threshold",
        "cost_price",
        "is_active",
    )
    search_fields = ("name", "sku", "category__name")
    list_filter = ("category", "is_active")
    raw_id_fields = ("category",)
    inlines = [ProductUnitInline]


@admin.register(ProductUnit)
class ProductUnitAdmin(BaseModelAdmin):
    form = ProductUnitForm
    list_display = (
        "product",
        "unit_code",
        "conversion_to_base_unit",
        "is_base_unit",
        "cost_price",
        "retail_price",
        "wholesale_price",
        "wholesale_threshold",
        "is_active",
    )
    list_filter = ("is_base_unit", "is_active")
    search_fields = ("product__name", "unit_code", "unit_name")


@admin.register(Inventory)
class InventoryAdmin(BaseModelAdmin):
    list_display = ("product", "branch", "quantity", "reorder_level", "is_active")
    search_fields = ("product__name", "product__sku", "branch__branch_name")
    list_filter = ("branch", "is_active")
    raw_id_fields = ("product", "branch")


@admin.register(StockMovement)
class StockMovementAdmin(BaseModelAdmin):
    list_display = (
        "product",
        "branch",
        "movement_type",
        "quantity_change",
        "previous_quantity",
        "new_quantity",
        "created_at",
    )
    search_fields = ("product__name", "product__sku", "reference")
    list_filter = ("movement_type", "branch", "created_at")
    raw_id_fields = ("inventory", "product", "branch", "sale")
