from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RolePermission
from .models import Branch


class BranchListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "customer"}

    def get(self, request):
        """List all active branches."""
        branches = Branch.objects.select_related("business").all()

        data = [
            {
                "id": str(b.id),
                "name": b.branch_name,
                "location": b.location,
                "business": b.business.business_name,
            }
            for b in branches
        ]

        return Response(data)
