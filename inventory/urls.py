from django.urls import path
from .views import (
    ProductBySkuView,
    ProductListView,
    ProductImportView,
    ProductImportTemplateView,
    CategoryListView,
    CategoryCreateView,
    CategoryUpdateView,
    InventoryStockLookupView,
    InventoryAdjustmentListView,
    InventoryAdjustmentCreateView,
    ProductCreateView,
    ProductUpdateView,
)

urlpatterns = [
    path("products/", ProductListView.as_view(), name="list_products"),
    path("sku/<str:sku>/", ProductBySkuView.as_view(), name="product_by_sku"),
    path("products/import/", ProductImportView.as_view(), name="product_import"),
    path("products/import-template/", ProductImportTemplateView.as_view(), name="product_import_template"),
    path("categories/", CategoryListView.as_view(), name="categories_list"),
    path("categories/create/", CategoryCreateView.as_view(), name="categories_create"),
    path("categories/<uuid:category_id>/", CategoryUpdateView.as_view(), name="categories_update"),
    path("products/create/", ProductCreateView.as_view(), name="product_create"),
    path("products/<uuid:product_id>/", ProductUpdateView.as_view(), name="product_update"),
    path("stock/lookup/", InventoryStockLookupView.as_view(), name="inventory_stock_lookup"),
    path("adjustments/", InventoryAdjustmentListView.as_view(), name="inventory_adjustments_list"),
    path("adjustments/create/", InventoryAdjustmentCreateView.as_view(), name="inventory_adjustments_create"),
]
