from django.contrib import admin
from core.admin import BaseModelAdmin
from .models import Route, DeliveryRun, DeliveryLocationPing


@admin.register(Route)
class RouteAdmin(BaseModelAdmin):
    list_display = ("name", "code", "branch", "is_active", "created_at")
    search_fields = ("name", "code")
    list_filter = ("branch", "is_active")


@admin.register(DeliveryRun)
class DeliveryRunAdmin(BaseModelAdmin):
    list_display = ("order", "delivery_person", "branch", "status", "assigned_at", "started_at", "delivered_at", "completed_at", "recipient_name")
    list_filter = ("status", "branch")
    search_fields = ("order__id", "order__sale__id", "delivery_person__username")


@admin.register(DeliveryLocationPing)
class DeliveryLocationPingAdmin(BaseModelAdmin):
    list_display = ("delivery_run", "delivery_person", "recorded_at", "latitude", "longitude")
    list_filter = ("recorded_at",)
    search_fields = ("delivery_run__id", "delivery_person__username")
