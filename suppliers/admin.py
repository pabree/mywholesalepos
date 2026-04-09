from django.contrib import admin
from core.admin import BaseModelAdmin
from .models import Supplier


@admin.register(Supplier)
class SupplierAdmin(BaseModelAdmin):
    list_display = ("name", "phone", "email", "contact_person", "is_active", "created_at")
    search_fields = ("name", "phone", "email", "contact_person")
    list_filter = ("is_active",)
