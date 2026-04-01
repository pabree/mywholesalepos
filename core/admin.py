from django.contrib import admin

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
