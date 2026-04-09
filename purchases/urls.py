from django.urls import path
from .views import (
    PurchaseOrderListView,
    PurchaseOrderCreateView,
    PurchaseOrderDetailView,
    PurchaseOrderUpdateView,
    PurchaseOrderLineAddView,
    PurchaseOrderLineUpdateView,
    PurchaseOrderLineDeleteView,
    PurchaseOrderMarkOrderedView,
    PurchaseOrderReceiveView,
)

urlpatterns = [
    path("", PurchaseOrderListView.as_view(), name="purchase_list"),
    path("create/", PurchaseOrderCreateView.as_view(), name="purchase_create"),
    path("<uuid:purchase_id>/", PurchaseOrderDetailView.as_view(), name="purchase_detail"),
    path("<uuid:purchase_id>/update/", PurchaseOrderUpdateView.as_view(), name="purchase_update"),
    path("<uuid:purchase_id>/lines/add/", PurchaseOrderLineAddView.as_view(), name="purchase_line_add"),
    path("<uuid:purchase_id>/lines/<uuid:line_id>/", PurchaseOrderLineUpdateView.as_view(), name="purchase_line_update"),
    path("<uuid:purchase_id>/lines/<uuid:line_id>/delete/", PurchaseOrderLineDeleteView.as_view(), name="purchase_line_delete"),
    path("<uuid:purchase_id>/mark-ordered/", PurchaseOrderMarkOrderedView.as_view(), name="purchase_mark_ordered"),
    path("<uuid:purchase_id>/receive/", PurchaseOrderReceiveView.as_view(), name="purchase_receive"),
]
