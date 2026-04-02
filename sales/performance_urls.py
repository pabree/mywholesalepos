from django.urls import path
from .performance_views import (
    PerformanceUserListView,
    CashierPerformanceView,
    SalespersonPerformanceView,
    DeliveryPerformanceView,
    RoutePerformanceView,
    CashierPerformanceExportView,
    SalespersonPerformanceExportView,
    DeliveryPerformanceExportView,
    RoutePerformanceExportView,
)


urlpatterns = [
    path("users/", PerformanceUserListView.as_view(), name="performance-users"),
    path("cashiers/", CashierPerformanceView.as_view(), name="performance-cashiers"),
    path("salespeople/", SalespersonPerformanceView.as_view(), name="performance-salespeople"),
    path("delivery/", DeliveryPerformanceView.as_view(), name="performance-delivery"),
    path("routes/", RoutePerformanceView.as_view(), name="performance-routes"),
    path("cashiers/export/", CashierPerformanceExportView.as_view(), name="performance-cashiers-export"),
    path("salespeople/export/", SalespersonPerformanceExportView.as_view(), name="performance-salespeople-export"),
    path("delivery/export/", DeliveryPerformanceExportView.as_view(), name="performance-delivery-export"),
    path("routes/export/", RoutePerformanceExportView.as_view(), name="performance-routes-export"),
]
