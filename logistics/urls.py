from django.urls import path
from .views import RouteListView


urlpatterns = [
    path("", RouteListView.as_view(), name="routes-list"),
]
