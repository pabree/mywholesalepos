from django.core.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission


def _normalize_role(role):
    return (role or "").strip().lower()


def _is_superuser(user):
    return bool(user and getattr(user, "is_superuser", False))


def require_role(user, role):
    if _is_superuser(user):
        return
    if _normalize_role(getattr(user, "role", "")) != _normalize_role(role):
        raise PermissionDenied("You do not have permission to perform this action")


class RolePermission(BasePermission):
    def has_permission(self, request, view):
        allowed = getattr(view, "allowed_roles", None)
        if allowed is None:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if _is_superuser(user):
            return True
        user_role = _normalize_role(getattr(user, "role", ""))
        allowed_roles = {_normalize_role(r) for r in allowed}
        if user_role == "admin":
            return True
        return user_role in allowed_roles
