from django.contrib import admin
from .models import Business, Branch


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ("business_name", "email", "phone", "kra_pin", "registration_date")
    search_fields = ("business_name", "email", "phone", "kra_pin")
    list_filter = ("registration_date",)


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("branch_name", "business", "location", "is_active", "created_at")
    search_fields = ("branch_name", "location", "business__business_name")
    list_filter = ("business", "is_active")
    raw_id_fields = ("business",)
