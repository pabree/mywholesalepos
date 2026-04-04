from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import models
from accounts.permissions import RolePermission
from .models import Route
from business.models import Branch


def _parse_bool(value):
    if value is None or str(value).strip() == "":
        return None
    val = str(value).strip().lower()
    if val in ("1", "true", "yes", "y", "on"):
        return True
    if val in ("0", "false", "no", "n", "off"):
        return False
    return None


class RouteListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin", "supervisor"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        include_inactive = request.query_params.get("include_inactive") == "1"
        user = request.user
        role = (getattr(user, "role", "") or "").strip().lower()
        can_view_inactive = getattr(user, "is_superuser", False) or role in ("admin", "supervisor")

        qs = Route.objects.select_related("branch")
        if not (include_inactive and can_view_inactive):
            qs = qs.filter(is_active=True)
        branch_id = request.query_params.get("branch")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if query:
            qs = qs.filter(models.Q(name__icontains=query) | models.Q(code__icontains=query))
        data = [
            {
                "id": str(route.id),
                "name": route.name,
                "code": route.code,
                "branch_id": str(route.branch_id) if route.branch_id else None,
                "branch_name": route.branch.branch_name if route.branch else None,
                "is_active": route.is_active,
            }
            for route in qs.order_by("name", "code")
        ]
        return Response(data)


class RouteCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request):
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        if not name:
            errors["name"] = "Route name is required."
        code = str(data.get("code") or "").strip()

        branch_id = data.get("branch_id") or data.get("branch")
        branch = None
        if branch_id:
            branch = Branch.objects.filter(id=branch_id).first()
            if not branch:
                errors["branch"] = "Branch not found."

        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        route = Route.objects.create(
            name=name,
            code=code,
            branch=branch,
            is_active=True if is_active is None else is_active,
        )
        return Response({"id": str(route.id)}, status=201)


class RouteUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, route_id):
        route = get_object_or_404(Route, id=route_id)
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        if not name:
            errors["name"] = "Route name is required."
        code = str(data.get("code") or "").strip()

        branch_id = data.get("branch_id") or data.get("branch")
        branch = None
        if branch_id:
            branch = Branch.objects.filter(id=branch_id).first()
            if not branch:
                errors["branch"] = "Branch not found."

        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        route.name = name
        route.code = code
        route.branch = branch
        if is_active is not None:
            route.is_active = is_active
        route.save()
        return Response({"id": str(route.id)}, status=200)
