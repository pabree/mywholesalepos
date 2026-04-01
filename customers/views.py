from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RolePermission
from .models import Customer


class CustomerListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        """List all active customers."""
        customers = Customer.objects.all()

        data = [
            {
                "id": str(c.id),
                "name": c.name,
            }
            for c in customers
        ]

        return Response(data)
