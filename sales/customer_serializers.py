from django.db import transaction
from rest_framework import serializers

from business.models import Branch
from inventory.models import Inventory, Product, ProductUnit
from sales.serializers import _build_sale_items, _persist_sale_items
from .models import CustomerOrder, Sale, SaleItem, SalePayment
from .services import compute_totals, money


class CustomerOrderItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    product_unit = serializers.PrimaryKeyRelatedField(queryset=ProductUnit.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class CustomerOrderCreateSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    items = CustomerOrderItemInputSerializer(many=True)
    credit_requested = serializers.BooleanField(required=False, default=False)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        customer = self.context["customer"]
        user = self.context.get("user")
        branch = validated_data["branch"]
        items_data = validated_data["items"]
        credit_requested = validated_data.get("credit_requested", False)

        sale_type = "wholesale"

        subtotal, sale_items_payload = _build_sale_items(
            items_data,
            customer=customer,
            sale_type=sale_type,
        )

        for (
            product,
            product_unit,
            quantity,
            unit_price,
            total_price,
            unit_cost,
            total_cost,
            gross_profit,
            conversion,
            base_quantity,
            price_type,
            reason,
        ) in sale_items_payload:
            try:
                inventory = Inventory.objects.select_for_update().get(branch=branch, product=product)
            except Inventory.DoesNotExist:
                raise serializers.ValidationError(
                    {"items": f"No inventory record for {product} at branch {branch}."}
                )
            if base_quantity <= 0:
                raise serializers.ValidationError({"items": "Base quantity is missing for sale item."})
            if inventory.quantity < base_quantity:
                raise serializers.ValidationError(
                    {"items": f"Not enough stock for {product}. Available {inventory.quantity}."}
                )

        totals = compute_totals(subtotal, money("0.00"), money("0.00"))

        sale = Sale.objects.create(
            branch=branch,
            customer=customer,
            sale_type=sale_type,
            route_snapshot=customer.route if getattr(customer, "route_id", None) else None,
            total_amount=totals["subtotal"],
            discount=money("0.00"),
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            amount_paid=money("0.00"),
            balance=totals["balance"],
            balance_due=totals["balance"],
        )
        sale.refresh_payment_status()
        sale.save(update_fields=["payment_status"])

        _persist_sale_items(sale, sale_items_payload)

        order = CustomerOrder.objects.create(
            sale=sale,
            status="pending_credit_approval" if credit_requested else "pending",
            credit_requested=credit_requested,
            credit_approval_status="pending" if credit_requested else "not_requested",
            placed_by=user if user and user.is_authenticated else None,
        )
        return order


class CustomerSaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_name = serializers.CharField(source="product_unit.unit_name", read_only=True)
    unit_code = serializers.CharField(source="product_unit.unit_code", read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            "product",
            "product_name",
            "product_unit",
            "unit_name",
            "unit_code",
            "quantity",
            "unit_price",
            "total_price",
        ]
        read_only_fields = fields


class CustomerSalePaymentSerializer(serializers.ModelSerializer):
    payment_method = serializers.CharField(source="method", read_only=True)
    received_by_name = serializers.SerializerMethodField()

    def get_received_by_name(self, obj):
        user = obj.received_by
        if not user:
            return ""
        display = getattr(user, "display_name", "") or ""
        if display:
            return display
        if hasattr(user, "get_full_name"):
            full_name = user.get_full_name()
            if full_name:
                return full_name
        return getattr(user, "username", "") or ""

    class Meta:
        model = SalePayment
        fields = [
            "id",
            "amount",
            "method",
            "payment_method",
            "status",
            "received_by_name",
            "payment_date",
            "reference",
            "phone_number",
            "note",
        ]
        read_only_fields = fields


class CustomerOrderSerializer(serializers.ModelSerializer):
    sale = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = CustomerOrder
        fields = [
            "id",
            "status",
            "credit_requested",
            "credit_approval_status",
            "credit_rejection_reason",
            "created_at",
            "updated_at",
            "sale",
            "branch",
            "items",
            "payments",
        ]
        read_only_fields = fields

    def _can_view_balance(self):
        return bool(self.context.get("can_view_balance"))

    def get_sale(self, obj):
        sale = obj.sale
        data = {
            "id": str(sale.id),
            "sale_type": sale.sale_type,
            "total_amount": str(sale.total_amount),
            "discount": str(sale.discount),
            "tax": str(sale.tax),
            "grand_total": str(sale.grand_total),
            "amount_paid": str(sale.amount_paid),
            "balance_due": str(sale.balance_due),
            "payment_status": sale.payment_status,
            "due_date": sale.due_date,
            "completed_at": sale.completed_at,
        }
        if not self._can_view_balance():
            for key in ("amount_paid", "balance_due", "payment_status", "due_date"):
                data.pop(key, None)
        return data

    def get_branch(self, obj):
        branch = obj.sale.branch
        return {
            "id": str(branch.id),
            "name": branch.branch_name,
            "location": branch.location,
        }

    def get_items(self, obj):
        return CustomerSaleItemSerializer(obj.sale.items.all(), many=True).data

    def get_payments(self, obj):
        if not self._can_view_balance():
            return []
        return CustomerSalePaymentSerializer(obj.sale.payments.all(), many=True).data


class StaffCustomerOrderListSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    route = serializers.SerializerMethodField()
    sale = serializers.SerializerMethodField()
    assigned_to = serializers.SerializerMethodField()
    items_preview = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    credit_approved_by = serializers.SerializerMethodField()

    class Meta:
        model = CustomerOrder
        fields = [
            "id",
            "status",
            "credit_requested",
            "credit_approval_status",
            "credit_rejection_reason",
            "credit_approved_by",
            "credit_approved_at",
            "created_at",
            "updated_at",
            "customer",
            "branch",
            "route",
            "sale",
            "assigned_to",
            "items_preview",
            "items_count",
        ]
        read_only_fields = fields

    def _sale(self, obj):
        return getattr(obj, "sale", None)

    def get_customer(self, obj):
        sale = self._sale(obj)
        customer = getattr(sale, "customer", None)
        if not customer:
            return None
        return {"id": str(customer.id), "name": customer.name}

    def get_branch(self, obj):
        sale = self._sale(obj)
        branch = getattr(sale, "branch", None)
        if not branch:
            return None
        return {"id": str(branch.id), "name": branch.branch_name, "location": branch.location}

    def get_route(self, obj):
        sale = self._sale(obj)
        customer = getattr(sale, "customer", None)
        route = getattr(customer, "route", None) if customer else None
        if not route:
            return None
        return {"id": str(route.id), "name": route.name, "code": route.code}

    def get_sale(self, obj):
        sale = self._sale(obj)
        if not sale:
            return None
        return {
            "id": str(sale.id),
            "sale_type": sale.sale_type,
            "status": sale.status,
            "grand_total": str(sale.grand_total),
            "payment_status": sale.payment_status,
            "balance_due": str(sale.balance_due),
            "due_date": sale.due_date,
        }

    def get_assigned_to(self, obj):
        sale = self._sale(obj)
        assigned = getattr(sale, "assigned_to", None)
        if not assigned:
            return None
        display_name = f"{assigned.first_name} {assigned.last_name}".strip() or assigned.username
        return {"id": str(assigned.id), "display_name": display_name, "role": assigned.role}

    def get_items_preview(self, obj):
        sale = self._sale(obj)
        if not sale:
            return []
        items = sale.items.all()[:3]
        return [{"product_name": i.product.name, "quantity": i.quantity} for i in items]

    def get_items_count(self, obj):
        sale = self._sale(obj)
        if not sale:
            return 0
        return sale.items.count()

    def get_credit_approved_by(self, obj):
        approved = getattr(obj, "credit_approved_by", None)
        if not approved:
            return None
        display_name = f"{approved.first_name} {approved.last_name}".strip() or approved.username
        return {"id": str(approved.id), "display_name": display_name, "role": approved.role}


class StaffCustomerOrderDetailSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    route = serializers.SerializerMethodField()
    sale = serializers.SerializerMethodField()
    assigned_to = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    credit_approved_by = serializers.SerializerMethodField()

    class Meta:
        model = CustomerOrder
        fields = [
            "id",
            "status",
            "credit_requested",
            "credit_approval_status",
            "credit_rejection_reason",
            "credit_approved_by",
            "credit_approved_at",
            "created_at",
            "updated_at",
            "customer",
            "branch",
            "route",
            "sale",
            "assigned_to",
            "items",
            "payments",
        ]
        read_only_fields = fields

    def _sale(self, obj):
        return getattr(obj, "sale", None)

    def get_customer(self, obj):
        sale = self._sale(obj)
        customer = getattr(sale, "customer", None)
        if not customer:
            return None
        return {"id": str(customer.id), "name": customer.name}

    def get_branch(self, obj):
        sale = self._sale(obj)
        branch = getattr(sale, "branch", None)
        if not branch:
            return None
        return {"id": str(branch.id), "name": branch.branch_name, "location": branch.location}

    def get_route(self, obj):
        sale = self._sale(obj)
        customer = getattr(sale, "customer", None)
        route = getattr(customer, "route", None) if customer else None
        if not route:
            return None
        return {"id": str(route.id), "name": route.name, "code": route.code}

    def get_sale(self, obj):
        sale = self._sale(obj)
        if not sale:
            return None
        return {
            "id": str(sale.id),
            "sale_type": sale.sale_type,
            "status": sale.status,
            "total_amount": str(sale.total_amount),
            "discount": str(sale.discount),
            "tax": str(sale.tax),
            "grand_total": str(sale.grand_total),
            "amount_paid": str(sale.amount_paid),
            "balance_due": str(sale.balance_due),
            "payment_status": sale.payment_status,
            "due_date": sale.due_date,
            "completed_at": sale.completed_at,
        }

    def get_assigned_to(self, obj):
        sale = self._sale(obj)
        assigned = getattr(sale, "assigned_to", None)
        if not assigned:
            return None
        display_name = f"{assigned.first_name} {assigned.last_name}".strip() or assigned.username
        return {"id": str(assigned.id), "display_name": display_name, "role": assigned.role}

    def get_items(self, obj):
        sale = self._sale(obj)
        if not sale:
            return []
        return CustomerSaleItemSerializer(sale.items.all(), many=True).data

    def get_payments(self, obj):
        sale = self._sale(obj)
        if not sale:
            return []
        return CustomerSalePaymentSerializer(sale.payments.all(), many=True).data

    def get_credit_approved_by(self, obj):
        approved = getattr(obj, "credit_approved_by", None)
        if not approved:
            return None
        display_name = f"{approved.first_name} {approved.last_name}".strip() or approved.username
        return {"id": str(approved.id), "display_name": display_name, "role": approved.role}


class CustomerOrderStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerOrder
        fields = ["status"]

    def validate_status(self, value):
        if self.instance is None:
            return value
        current = self.instance.status
        if value == current:
            return value

        allowed = {
            "pending": {"confirmed", "cancelled"},
            "pending_credit_approval": {"confirmed", "cancelled"},
            "confirmed": {"processing", "cancelled"},
            "processing": {"out_for_delivery", "cancelled"},
            "out_for_delivery": {"delivered", "cancelled"},
            "delivered": set(),
            "cancelled": set(),
        }
        if value not in allowed.get(current, set()):
            raise serializers.ValidationError(f"Cannot move order from {current} to {value}.")
        if (
            self.instance.credit_requested
            and self.instance.credit_approval_status == "pending"
            and value in {"confirmed", "processing", "out_for_delivery", "delivered"}
        ):
            raise serializers.ValidationError("Credit approval is required before advancing this order.")
        if value == "delivered" and self.instance.sale.status != "completed":
            raise serializers.ValidationError("Sale must be completed before marking as delivered.")
        return value
