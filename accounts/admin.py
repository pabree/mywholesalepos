from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, DriverLicense


class UserAdmin(BaseUserAdmin):
    ordering = ("username",)
    list_display = ("username", "email", "first_name", "last_name", "role", "is_staff")
    list_filter = ("role", "is_staff", "is_active", "branch")

    fieldsets = (
        (None, {"fields": ("username", "email", "password")}),
        ("Personal Info", {"fields": ("first_name", "middle_name", "last_name", "phone", "id_number", "date_of_birth")}),
        ("Work Info", {"fields": ("role", "branch")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("username", "email", "first_name", "last_name", "role", "password1", "password2", "is_staff", "is_active"),
        }),
    )

    search_fields = ("username", "email", "first_name", "last_name", "phone", "id_number")


admin.site.register(User, UserAdmin)
admin.site.register(DriverLicense)
