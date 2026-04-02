from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RolePermission
from .models import Route


class RouteListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        qs = Route.objects.filter(is_active=True).select_related("branch")
        branch_id = request.query_params.get("branch")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        data = [
            {
                "id": str(route.id),
                "name": route.name,
                "code": route.code,
                "branch_id": str(route.branch_id) if route.branch_id else None,
                "branch_name": route.branch.branch_name if route.branch else None,
            }
            for route in qs.order_by("name", "code")
        ]
        return Response(data)
