from django.urls import path
from .delivery_views import (
    DeliveryRunListView,
    DeliveryDashboardView,
    DeliveryQueueView,
    DeliveryRunCreateView,
    DeliveryRunDetailView,
    DeliveryRunHistoryView,
    DeliveryRunCancelView,
    DeliveryRunStartView,
    DeliveryRunStatusView,
    DeliveryRunLocationView,
    DeliveryRunCompleteView,
    DeliveryRunFailView,
)


urlpatterns = [
    path("dashboard/", DeliveryDashboardView.as_view(), name="delivery-dashboard"),
    path("runs/", DeliveryRunListView.as_view(), name="delivery-runs-list"),
    path("queue/", DeliveryQueueView.as_view(), name="delivery-queue"),
    path("runs/create/", DeliveryRunCreateView.as_view(), name="delivery-runs-create"),
    path("runs/<uuid:run_id>/", DeliveryRunDetailView.as_view(), name="delivery-runs-detail"),
    path("runs/<uuid:run_id>/history/", DeliveryRunHistoryView.as_view(), name="delivery-runs-history"),
    path("runs/<uuid:run_id>/cancel/", DeliveryRunCancelView.as_view(), name="delivery-runs-cancel"),
    path("runs/<uuid:run_id>/start/", DeliveryRunStartView.as_view(), name="delivery-runs-start"),
    path("runs/<uuid:run_id>/status/", DeliveryRunStatusView.as_view(), name="delivery-runs-status"),
    path("runs/<uuid:run_id>/location/", DeliveryRunLocationView.as_view(), name="delivery-runs-location"),
    path("runs/<uuid:run_id>/complete/", DeliveryRunCompleteView.as_view(), name="delivery-runs-complete"),
    path("runs/<uuid:run_id>/fail/", DeliveryRunFailView.as_view(), name="delivery-runs-fail"),
]
