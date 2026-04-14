from django.contrib import admin
from core.models import SystemBackup

SYSTEM_EXCLUDE_FIELDS = (
    "correlation_id",
    "deleted_at",
    "created_by",
    "updated_by",
)

SYSTEM_READONLY_FIELDS = (
    "created_at",
    "updated_at",
)


class BaseModelAdmin(admin.ModelAdmin):
    readonly_fields = SYSTEM_READONLY_FIELDS
    exclude = SYSTEM_EXCLUDE_FIELDS


class BaseTabularInline(admin.TabularInline):
    readonly_fields = SYSTEM_READONLY_FIELDS
    exclude = SYSTEM_EXCLUDE_FIELDS


@admin.register(SystemBackup)
class SystemBackupAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "backup_type",
        "file_name",
        "size_bytes",
        "status",
        "remote_upload_status",
        "created_by",
    )
    list_filter = ("backup_type", "status")
    search_fields = ("file_name", "storage_path", "error_message")
    readonly_fields = (
        "created_at",
        "size_bytes",
        "status",
        "error_message",
        "remote_storage_type",
        "remote_storage_key",
        "remote_upload_status",
        "remote_error_message",
    )
