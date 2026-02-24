from django.core.exceptions import PermissionDenied

def require_role(user, role):
    if user.role != role:
        raise PermissionDenied("You do not have permission to perform this action")