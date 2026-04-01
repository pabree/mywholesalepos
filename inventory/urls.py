from django.urls import path
from .views import ProductBySkuView, ProductListView

urlpatterns = [
    path("products/", ProductListView.as_view(), name="list_products"),
    path("sku/<str:sku>/", ProductBySkuView.as_view(), name="product_by_sku"),
]
