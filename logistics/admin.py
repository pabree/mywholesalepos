from django.contrib import admin
from core.admin import BaseModelAdmin
from .models import Route


@admin.register(Route)
class RouteAdmin(BaseModelAdmin):
    list_display = ("name", "code", "branch", "is_active", "created_at")
    search_fields = ("name", "code")
    list_filter = ("branch", "is_active")
