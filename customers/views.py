from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RolePermission
from .models import Customer
from core.pagination import StandardLimitOffsetPagination


class CustomerListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        """List all active customers."""
        customers = Customer.objects.select_related("route").all().order_by("name", "id")

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(customers, request, view=self)
        page = page if page is not None else customers

        data = [
            {
                "id": str(c.id),
                "name": c.name,
                "route_id": str(c.route_id) if c.route_id else None,
                "route_name": c.route.name if c.route else None,
            }
            for c in page
        ]

        if page is not customers:
            return paginator.get_paginated_response(data)
        return Response(data)
