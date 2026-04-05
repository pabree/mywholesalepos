from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from accounts.permissions import RolePermission
from accounts.models import User
from .models import Customer
from logistics.models import Route
from core.pagination import StandardLimitOffsetPagination


class CustomerListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        """List all active customers."""
        query = (request.query_params.get("search") or "").strip()
        route_id = request.query_params.get("route")
        branch_id = request.query_params.get("branch")
        include_inactive = request.query_params.get("include_inactive") == "1"

        user = request.user
        role = (getattr(user, "role", "") or "").strip().lower()
        can_view_inactive = getattr(user, "is_superuser", False) or role in ("admin", "supervisor")

        qs = Customer.all_objects.select_related("route", "route__branch") if (include_inactive and can_view_inactive) else Customer.objects.select_related("route", "route__branch")

        if query:
            qs = qs.filter(name__icontains=query)
        if route_id:
            qs = qs.filter(route_id=route_id)
        if branch_id:
            qs = qs.filter(route__branch_id=branch_id)

        customers = qs.order_by("name", "id")

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(customers, request, view=self)
        page = page if page is not None else customers

        data = [
            {
                "id": str(c.id),
                "name": c.name,
                "is_wholesale_customer": c.is_wholesale_customer,
                "is_active": c.is_active,
                "can_view_balance": c.can_view_balance,
                "route_id": str(c.route_id) if c.route_id else None,
                "route_name": c.route.name if c.route else None,
                "route_code": c.route.code if c.route else None,
                "branch_name": c.route.branch.branch_name if c.route and c.route.branch else None,
                "user_id": str(c.user_id) if c.user_id else None,
                "user_username": c.user.username if c.user else None,
                "user_email": c.user.email if c.user else None,
            }
            for c in page
        ]

        if page is not customers:
            return paginator.get_paginated_response(data)
        return Response(data)


def _parse_bool(value):
    if value is None or str(value).strip() == "":
        return None
    val = str(value).strip().lower()
    if val in ("1", "true", "yes", "y", "on"):
        return True
    if val in ("0", "false", "no", "n", "off"):
        return False
    return None


class CustomerCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request):
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        if not name:
            errors["name"] = "Name is required."

        route_id = data.get("route_id") or data.get("route")
        route = None
        if route_id:
            route = Route.objects.filter(id=route_id).first()
            if not route:
                errors["route"] = "Route not found."

        is_wholesale = _parse_bool(data.get("is_wholesale_customer"))
        can_view_balance = _parse_bool(data.get("can_view_balance"))
        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        customer = Customer.objects.create(
            name=name,
            route=route,
            is_wholesale_customer=False if is_wholesale is None else is_wholesale,
            can_view_balance=False if can_view_balance is None else can_view_balance,
            is_active=True if is_active is None else is_active,
        )
        return Response({"id": str(customer.id)}, status=201)


class CustomerUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, customer_id):
        customer = get_object_or_404(Customer, id=customer_id)
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        if not name:
            errors["name"] = "Name is required."

        route_id = data.get("route_id") or data.get("route")
        route = None
        if route_id:
            route = Route.objects.filter(id=route_id).first()
            if not route:
                errors["route"] = "Route not found."

        is_wholesale = _parse_bool(data.get("is_wholesale_customer"))
        can_view_balance = _parse_bool(data.get("can_view_balance"))
        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        customer.name = name
        customer.route = route
        if is_wholesale is not None:
            customer.is_wholesale_customer = is_wholesale
        if can_view_balance is not None:
            customer.can_view_balance = can_view_balance
        if is_active is not None:
            customer.is_active = is_active
        customer.save()
        return Response({"id": str(customer.id)}, status=200)


class CustomerApproveView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, customer_id):
        customer = get_object_or_404(Customer.all_objects, id=customer_id)
        customer.is_active = True
        customer.deleted_at = None
        customer.save(update_fields=["is_active", "deleted_at", "updated_at"])
        return Response({"id": str(customer.id), "approved": True}, status=200)


class CustomerLinkView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request, customer_id):
        customer = get_object_or_404(Customer.all_objects, id=customer_id)
        data = request.data or {}
        identifier = str(data.get("user_identifier") or data.get("username") or data.get("email") or data.get("phone") or "").strip()
        user_id = data.get("user_id")

        user = None
        if user_id:
            user = User.objects.filter(id=user_id).first()
        if not user and identifier:
            user = (
                User.objects.filter(username=identifier).first()
                or User.objects.filter(email=identifier).first()
                or User.objects.filter(phone=identifier).first()
            )

        if not user:
            return Response({"user": "User not found."}, status=404)
        if user.role != "customer":
            return Response({"user": "Only customer accounts can be linked."}, status=400)
        if customer.user and customer.user_id != user.id:
            return Response({"customer": "Customer already linked to another account."}, status=400)
        existing_link = getattr(user, "customer_profile", None)
        if existing_link and existing_link.id != customer.id:
            return Response({"user": "This account is already linked to another customer."}, status=400)

        customer.user = user
        customer.save(update_fields=["user", "updated_at"])
        return Response({"id": str(customer.id), "user_id": str(user.id)}, status=200)
