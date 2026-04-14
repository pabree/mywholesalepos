from django.urls import path

from .views import (
    DashboardSummaryReportView,
    InventorySummaryReportView,
    SalesSummaryReportView,
    TopProductsReportView,
)

urlpatterns = [
    path("sales-summary/", SalesSummaryReportView.as_view(), name="reports-sales-summary"),
    path("top-products/", TopProductsReportView.as_view(), name="reports-top-products"),
    path("inventory-summary/", InventorySummaryReportView.as_view(), name="reports-inventory-summary"),
    path("dashboard/", DashboardSummaryReportView.as_view(), name="reports-dashboard"),
]
