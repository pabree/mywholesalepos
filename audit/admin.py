from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "table_name", "record_id", "user")
    list_filter = ("action", "table_name", "created_at")
    search_fields = ("table_name", "record_id", "user__email")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "updated_at", "user", "action", "table_name", "record_id", "old_data", "new_data")
