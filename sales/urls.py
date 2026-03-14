from django.urls import path
from .views import CreateSaleView, sale_receipt

urlpatterns = [
    path("create-sale/", CreateSaleView.as_view(), name="create-sale"),
    path("<uuid:sale_id>/receipt/", sale_receipt, name="sale_receipt")
]