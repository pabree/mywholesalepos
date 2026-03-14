from django.urls import path
from .views import product_by_sku

urlpatterns = [
    path("sku/<str:sku>/", product_by_sku, name="product_by_sku")
]