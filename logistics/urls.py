from django.urls import path
from .views import RouteListView, RouteCreateView, RouteUpdateView


urlpatterns = [
    path("", RouteListView.as_view(), name="routes-list"),
    path("create/", RouteCreateView.as_view(), name="routes-create"),
    path("<uuid:route_id>/", RouteUpdateView.as_view(), name="routes-update"),
]
