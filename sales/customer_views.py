from django.core.exceptions import PermissionDenied
from django.db.models import Sum, Q, Count
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from accounts.permissions import RolePermission
from accounts.models import User
from customers.models import Customer
from inventory.models import Product
from sales.pricing import get_unit_price
from .models import CustomerOrder, Sale
from .customer_serializers import (
    CustomerOrderCreateSerializer,
    CustomerOrderSerializer,
)
from core.pagination import StandardLimitOffsetPagination


def _get_customer_or_denied(user):
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication required.")
    customer = Customer.all_objects.select_related("route", "route__branch").filter(user=user).first()
    if not customer:
        raise PermissionDenied("Customer profile not linked to this user.")
    if not customer.is_active or customer.deleted_at:
        raise PermissionDenied("Customer account pending approval.")
    return customer


class CustomerProfileView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"customer"}

    def get(self, request):
        customer = Customer.all_objects.select_related("route", "route__branch").filter(user=request.user).first()
        if not customer:
            return Response({"linked": False, "approved": False}, status=200)
        return Response(
            {
                "linked": True,
                "approved": bool(customer.is_active) and not customer.deleted_at,
                "customer_id": str(customer.id),
                "name": customer.name,
                "route_id": str(customer.route_id) if customer.route_id else None,
                "route_name": customer.route.name if customer.route else None,
                "branch_name": customer.route.branch.branch_name if customer.route and customer.route.branch else None,
                "can_view_balance": customer.can_view_balance,
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class CustomerSignupView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        data = request.data or {}
        errors = {}

        name = str(data.get("name") or "").strip()
        email = str(data.get("email") or "").strip().lower()
        phone = str(data.get("phone") or "").strip()
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")

        if not name:
            errors["name"] = "Name is required."
        if not email:
            errors["email"] = "Email is required."
        if not password or len(password) < 6:
            errors["password"] = "Password must be at least 6 characters."

        if not username:
            if phone:
                username = phone
            elif email:
                username = email.split("@")[0]

        if not username:
            errors["username"] = "Username is required."

        if username and User.objects.filter(username=username).exists():
            errors["username"] = "Username already exists."
        if email and User.objects.filter(email=email).exists():
            errors["email"] = "Email already exists."
        if phone and User.objects.filter(phone=phone).exists():
            errors["phone"] = "Phone number already exists."

        if errors:
            return Response(errors, status=400)

        name_parts = name.split()
        first_name = name_parts[0] if name_parts else "Customer"
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else "Customer"

        user = User.objects.create_user(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone or None,
            role="customer",
            is_active=True,
        )

        customer = Customer.objects.create(
            name=name,
            user=user,
            is_wholesale_customer=False,
            can_view_balance=False,
            is_active=False,
        )

        return Response(
            {
                "message": "Account created. Pending approval.",
                "customer_id": str(customer.id),
                "approved": False,
            },
            status=201,
        )


class CustomerCatalogView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"customer"}

    def get(self, request):
        customer = _get_customer_or_denied(request.user)
        branch_id = request.query_params.get("branch")

        products = Product.objects.select_related("category").prefetch_related("units")
        if branch_id:
            products = products.annotate(
                stock=Sum("inventory__quantity", filter=Q(inventory__branch_id=branch_id))
            )
        else:
            products = products.annotate(stock=Sum("inventory__quantity"))

        products = products.order_by("name", "sku")
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(products, request, view=self)
        page = page if page is not None else products

        sale_type = "wholesale"
        data = []
        for product in page:
            total_stock = int(product.stock or 0)
            units = []
            for unit in product.units.filter(is_active=True):
                try:
                    unit_price, price_type, reason = get_unit_price(
                        product_unit=unit,
                        customer=customer,
                        quantity=1,
                        sale_type=sale_type,
                    )
                    display_price = str(unit_price)
                except ValueError:
                    display_price = None
                    price_type = None
                    reason = None

                units.append(
                    {
                        "id": str(unit.id),
                        "unit_name": unit.unit_name,
                        "unit_code": unit.unit_code,
                        "conversion_to_base_unit": unit.conversion_to_base_unit,
                        "is_base_unit": unit.is_base_unit,
                        "retail_price": str(unit.retail_price) if unit.retail_price is not None else None,
                        "wholesale_price": str(unit.wholesale_price) if unit.wholesale_price is not None else None,
                        "wholesale_threshold": unit.wholesale_threshold,
                        "display_price": display_price,
                        "price_type": price_type,
                        "pricing_reason": reason,
                    }
                )

            data.append(
                {
                    "id": str(product.id),
                    "name": product.name,
                    "sku": product.sku,
                    "category": product.category.name if product.category else None,
                    "retail_price": str(product.retail_price or product.selling_price),
                    "wholesale_price": str(product.wholesale_price) if product.wholesale_price is not None else None,
                    "wholesale_threshold": product.wholesale_threshold,
                    "units": units,
                    "stock": total_stock,
                }
            )

        if page is not products:
            return paginator.get_paginated_response(data)
        return Response(data)


class CustomerOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"customer"}

    def get(self, request):
        customer = _get_customer_or_denied(request.user)
        orders = (
            CustomerOrder.objects.select_related("sale", "sale__branch")
            .prefetch_related("sale__items", "sale__items__product", "sale__items__product_unit", "sale__payments")
            .filter(sale__customer=customer)
            .order_by("-created_at")
        )
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(orders, request, view=self)
        page = page if page is not None else orders
        serializer = CustomerOrderSerializer(
            page,
            many=True,
            context={"can_view_balance": customer.can_view_balance},
        )
        if page is not orders:
            return paginator.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def post(self, request):
        customer = _get_customer_or_denied(request.user)
        serializer = CustomerOrderCreateSerializer(
            data=request.data,
            context={"customer": customer, "user": request.user},
        )
        if serializer.is_valid():
            order = serializer.save()
            output = CustomerOrderSerializer(
                order,
                context={"can_view_balance": customer.can_view_balance},
            ).data
            return Response(output, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"customer"}

    def get(self, request, order_id):
        customer = _get_customer_or_denied(request.user)
        order = get_object_or_404(CustomerOrder, id=order_id, sale__customer=customer)
        serializer = CustomerOrderSerializer(
            order,
            context={"can_view_balance": customer.can_view_balance},
        )
        return Response(serializer.data)


class CustomerOrderCancelView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"customer"}

    def post(self, request, order_id):
        customer = _get_customer_or_denied(request.user)
        order = get_object_or_404(CustomerOrder, id=order_id, sale__customer=customer)

        if order.status not in ("pending", "confirmed", "pending_credit_approval"):
            return Response(
                {"detail": f"Cannot cancel an order in '{order.status}' status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale = order.sale
        if sale.status == "completed":
            return Response(
                {"detail": "Completed sales cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = "cancelled"
        order.save(update_fields=["status", "updated_at"])
        if sale.status != "cancelled":
            sale.cancel()

        return Response({"message": "Order cancelled", "order_id": str(order.id), "status": order.status})


class CustomerBalanceSummaryView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"customer"}

    def get(self, request):
        customer = _get_customer_or_denied(request.user)
        if not customer.can_view_balance:
            return Response({"detail": "Balance viewing is not enabled for this customer."}, status=403)

        today = timezone.localdate()
        base_qs = Sale.objects.filter(
            is_credit_sale=True,
            status="completed",
            customer_id=customer.id,
        )
        open_qs = base_qs.filter(balance_due__gt=0)
        overdue_qs = open_qs.filter(due_date__lt=today)

        summary = open_qs.aggregate(
            total_outstanding=Sum("balance_due"),
            open_count=Count("id"),
            unpaid_count=Count("id", filter=Q(payment_status="unpaid")),
            partial_count=Count("id", filter=Q(payment_status="partial")),
        )
        overdue_balance = overdue_qs.aggregate(total=Sum("balance_due"))["total"]
        overdue_count = overdue_qs.count()

        return Response(
            {
                "customer_id": str(customer.id),
                "total_outstanding": summary["total_outstanding"] or 0,
                "overdue_balance": overdue_balance or 0,
                "open_count": summary["open_count"] or 0,
                "unpaid_count": summary["unpaid_count"] or 0,
                "partial_count": summary["partial_count"] or 0,
                "overdue_count": overdue_count,
            }
        )
