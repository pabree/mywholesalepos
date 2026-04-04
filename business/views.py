from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q
from accounts.permissions import RolePermission
from .models import Branch, Business


def _parse_bool(value):
    if value is None or str(value).strip() == "":
        return None
    val = str(value).strip().lower()
    if val in ("1", "true", "yes", "y", "on"):
        return True
    if val in ("0", "false", "no", "n", "off"):
        return False
    return None


class BranchListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin", "customer"}

    def get(self, request):
        """List all active branches."""
        query = (request.query_params.get("search") or "").strip()
        include_inactive = request.query_params.get("include_inactive") == "1"

        user = request.user
        role = (getattr(user, "role", "") or "").strip().lower()
        can_view_inactive = getattr(user, "is_superuser", False) or role in ("admin", "supervisor")

        branches = Branch.objects.select_related("business").all()
        if not (include_inactive and can_view_inactive):
            branches = branches.filter(is_active=True)
        if query:
            branches = branches.filter(
                Q(branch_name__icontains=query) | Q(location__icontains=query)
            )

        data = [
            {
                "id": str(b.id),
                "name": b.branch_name,
                "location": b.location,
                "business": b.business.business_name,
                "is_active": b.is_active,
            }
            for b in branches
        ]

        return Response(data)


class BranchCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request):
        data = request.data or {}
        errors = {}

        name = str(data.get("branch_name") or data.get("name") or "").strip()
        location = str(data.get("location") or "").strip()
        if not name:
            errors["branch_name"] = "Branch name is required."
        if not location:
            errors["location"] = "Location is required."

        business_id = data.get("business_id") or data.get("business")
        business = None
        if business_id:
            business = Business.objects.filter(id=business_id).first()
            if not business:
                errors["business"] = "Business not found."
        else:
            business = Business.objects.order_by("created_at").first()
            if not business:
                errors["business"] = "Business is required."

        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        branch = Branch.objects.create(
            business=business,
            branch_name=name,
            location=location,
            is_active=True if is_active is None else is_active,
        )
        return Response({"id": str(branch.id)}, status=201)


class BranchUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, branch_id):
        branch = get_object_or_404(Branch, id=branch_id)
        data = request.data or {}
        errors = {}

        name = str(data.get("branch_name") or data.get("name") or "").strip()
        location = str(data.get("location") or "").strip()
        if not name:
            errors["branch_name"] = "Branch name is required."
        if not location:
            errors["location"] = "Location is required."

        business_id = data.get("business_id") or data.get("business")
        business = None
        if business_id:
            business = Business.objects.filter(id=business_id).first()
            if not business:
                errors["business"] = "Business not found."

        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        branch.branch_name = name
        branch.location = location
        if business:
            branch.business = business
        if is_active is not None:
            branch.is_active = is_active
        branch.save()
        return Response({"id": str(branch.id)}, status=200)
