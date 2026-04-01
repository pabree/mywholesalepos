from django.contrib import admin
from core.admin import BaseModelAdmin
from .models import Customer


@admin.register(Customer)
class CustomerAdmin(BaseModelAdmin):
    list_display = ("name", "user", "is_wholesale_customer", "can_view_balance", "is_active", "created_at", "updated_at")
    search_fields = ("name",)
    list_filter = ("is_wholesale_customer", "can_view_balance", "is_active", "created_at")
