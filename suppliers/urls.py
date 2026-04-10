from django.urls import path
from .views import (
    SupplierListView,
    SupplierCreateView,
    SupplierUpdateView,
    SupplierProductsView,
    SupplierLedgerView,
    SupplierBalancesView,
)

urlpatterns = [
    path("", SupplierListView.as_view(), name="list_suppliers"),
    path("create/", SupplierCreateView.as_view(), name="create_supplier"),
    path("<uuid:supplier_id>/", SupplierUpdateView.as_view(), name="update_supplier"),
    path("<uuid:supplier_id>/products/", SupplierProductsView.as_view(), name="supplier_products"),
    path("<uuid:supplier_id>/ledger/", SupplierLedgerView.as_view(), name="supplier_ledger"),
    path("<uuid:supplier_id>/balances/", SupplierBalancesView.as_view(), name="supplier_balances"),
]
