from django.contrib import admin
from core.admin import BaseModelAdmin
from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(BaseModelAdmin):
    list_display = ("id", "date", "amount", "category", "branch", "created_at")
    list_filter = ("date", "category", "branch")
    search_fields = ("id", "category", "description", "reference")
    raw_id_fields = ("branch",)
