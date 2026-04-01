from django.urls import path
from .customer_views import (
    CustomerCatalogView,
    CustomerOrderListCreateView,
    CustomerOrderDetailView,
    CustomerOrderCancelView,
    CustomerBalanceSummaryView,
)

urlpatterns = [
    path("catalog/", CustomerCatalogView.as_view(), name="customer-catalog"),
    path("orders/", CustomerOrderListCreateView.as_view(), name="customer-orders"),
    path("orders/<uuid:order_id>/", CustomerOrderDetailView.as_view(), name="customer-order-detail"),
    path("orders/<uuid:order_id>/cancel/", CustomerOrderCancelView.as_view(), name="customer-order-cancel"),
    path("balance/", CustomerBalanceSummaryView.as_view(), name="customer-balance-summary"),
]
