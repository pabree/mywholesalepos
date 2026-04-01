from decimal import Decimal
from django.db import transaction, IntegrityError
from rest_framework import serializers
from .models import Sale, SaleItem, SalePayment
from .pricing import get_unit_price
from .services import money, compute_totals


class SaleItemSerializer(serializers.ModelSerializer):

    class Meta:
        model = SaleItem
        fields = [
            "product",
            "product_unit",
            "quantity",
            "unit_price",
            "total_price",
            "conversion_snapshot",
            "base_quantity",
            "price_type_used",
            "pricing_reason",
        ]
        read_only_fields = ["unit_price", "total_price", "conversion_snapshot", "base_quantity", "price_type_used", "pricing_reason"]


class SaleSerializer(serializers.ModelSerializer):

    items = SaleItemSerializer(many=True)
    payments = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "branch",
            "customer",
            "sale_type",
            "status",
            "is_credit_sale",
            "payment_mode",
            "payment_status",
            "due_date",
            "assigned_to",
            "total_amount",
            "discount",
            "tax",
            "grand_total",
            "amount_paid",
            "balance",
            "balance_due",
            "completed_at",
            "sale_date",
            "updated_at",
            "items",
            "payments",
        ]
        read_only_fields = [
            "id",
            "total_amount",
            "tax",
            "grand_total",
            "balance",
            "balance_due",
            "payment_status",
            "completed_at",
            "sale_date",
            "updated_at",
        ]

    def get_payments(self, obj):
        return SalePaymentSerializer(obj.payments.all(), many=True).data

    def validate(self, attrs):
        is_credit_sale = attrs.get("is_credit_sale", getattr(self.instance, "is_credit_sale", False))
        sale_type = attrs.get("sale_type", getattr(self.instance, "sale_type", None))
        assigned_to = attrs.get("assigned_to", getattr(self.instance, "assigned_to", None))

        if is_credit_sale:
            if sale_type != "wholesale":
                raise serializers.ValidationError({"sale_type": "Credit sales must be wholesale."})
            if assigned_to is None:
                raise serializers.ValidationError({"assigned_to": "Credit sales require an assigned delivery person or salesperson."})
            if assigned_to.role not in ("deliver_person", "salesperson"):
                raise serializers.ValidationError({"assigned_to": "Assigned user must be a delivery person or salesperson."})
            if not attrs.get("payment_mode") and getattr(self.instance, "payment_mode", None) is None:
                attrs["payment_mode"] = "credit"

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_overdue():
            data["payment_status"] = "overdue"
        return data

    def _validate_money_fields(self, attrs, *, defaults=None):
        defaults = defaults or {}

        if "discount" in attrs:
            discount = attrs["discount"]
            try:
                discount = money(discount)
            except Exception:
                raise serializers.ValidationError({"discount": "Invalid discount value."})
            if discount < 0:
                raise serializers.ValidationError({"discount": "Discount cannot be negative."})
            attrs["discount"] = discount
        else:
            discount = money(defaults.get("discount", Decimal("0")))

        if "amount_paid" in attrs:
            amount_paid = attrs["amount_paid"]
            try:
                amount_paid = money(amount_paid)
            except Exception:
                raise serializers.ValidationError({"amount_paid": "Invalid amount_paid value."})
            if amount_paid < 0:
                raise serializers.ValidationError({"amount_paid": "Amount paid cannot be negative."})
            attrs["amount_paid"] = amount_paid
        else:
            amount_paid = money(defaults.get("amount_paid", Decimal("0")))

        return attrs, discount, amount_paid

    def _enforce_amount_paid_bounds(self, amount_paid, grand_total):
        if amount_paid < 0:
            raise serializers.ValidationError({"amount_paid": "Amount paid cannot be negative."})

    def validate_status(self, value):
        if self.instance is not None:
            raise serializers.ValidationError("Status cannot be updated here.")
        if value not in ("draft", "held"):
            raise serializers.ValidationError("Status must be draft or held.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        if not items_data:
            raise serializers.ValidationError("At least one item is required.")

        validated_data, discount, amount_paid = self._validate_money_fields(validated_data)
        validated_data.setdefault("discount", discount)
        validated_data.setdefault("amount_paid", amount_paid)

        subtotal, sale_items_payload = _build_sale_items(
            items_data,
            customer=validated_data["customer"],
            sale_type=validated_data.get("sale_type"),
        )
        try:
            totals = compute_totals(subtotal, discount, amount_paid)
        except ValueError as exc:
            raise serializers.ValidationError({"discount": str(exc)})
        self._enforce_amount_paid_bounds(amount_paid, totals["grand_total"])

        sale = Sale.objects.create(
            **validated_data,
            total_amount=totals["subtotal"],
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            balance=totals["balance"],
            balance_due=totals["balance"],
        )
        sale.refresh_payment_status()
        sale.save(update_fields=["payment_status"])

        _persist_sale_items(sale, sale_items_payload)
        return sale

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.status not in ("draft", "held"):
            raise serializers.ValidationError({"detail": "Only draft or held sales can be edited."})

        items_data = validated_data.pop("items", None)
        customer_changed = "customer" in validated_data and validated_data["customer"] != instance.customer
        sale_type_changed = "sale_type" in validated_data and validated_data["sale_type"] != instance.sale_type

        validated_data, discount, amount_paid = self._validate_money_fields(
            {**validated_data},
            defaults={"discount": instance.discount, "amount_paid": instance.amount_paid},
        )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        sale_items_payload = None
        if items_data is not None:
            if not items_data:
                raise serializers.ValidationError({"items": "At least one item is required."})
            subtotal, sale_items_payload = _build_sale_items(
                items_data,
                customer=instance.customer,
                sale_type=instance.sale_type,
            )
        else:
            if customer_changed or sale_type_changed:
                existing_items = [
                    {
                        "product": i.product,
                        "product_unit": i.product_unit,
                        "quantity": i.quantity,
                    }
                    for i in instance.items.all()
                ]
                if not existing_items:
                    raise serializers.ValidationError({"items": "At least one item is required."})
                subtotal, sale_items_payload = _build_sale_items(
                    existing_items,
                    customer=instance.customer,
                    sale_type=instance.sale_type,
                )
            else:
                subtotal = money(sum(i.total_price for i in instance.items.all()))

        if "discount" in validated_data:
            instance.discount = discount
        if "amount_paid" in validated_data:
            instance.amount_paid = amount_paid

        try:
            totals = compute_totals(subtotal, instance.discount, instance.amount_paid)
        except ValueError as exc:
            raise serializers.ValidationError({"discount": str(exc)})
        self._enforce_amount_paid_bounds(instance.amount_paid, totals["grand_total"])
        instance.total_amount = totals["subtotal"]
        instance.tax = totals["tax"]
        instance.grand_total = totals["grand_total"]
        instance.balance = totals["balance"]
        instance.balance_due = totals["balance"]
        instance.refresh_payment_status()
        instance.save()

        if sale_items_payload is not None:
            instance.items.all().delete()
            _persist_sale_items(instance, sale_items_payload)
        return instance


class SaleDetailSerializer(SaleSerializer):
    class Meta(SaleSerializer.Meta):
        read_only_fields = SaleSerializer.Meta.fields


class SaleCompleteSerializer(serializers.Serializer):
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    def validate(self, attrs):
        _, discount, amount_paid = SaleSerializer()._validate_money_fields(attrs)
        attrs["discount"] = discount
        attrs["amount_paid"] = amount_paid
        return attrs

    @transaction.atomic
    def save(self, sale):
        sale = Sale.objects.select_for_update().get(pk=sale.pk)
        if sale.status not in ("draft", "held"):
            raise serializers.ValidationError({"detail": "Only draft or held sales can be completed."})
        if sale.items.count() == 0:
            raise serializers.ValidationError({"detail": "Cannot complete a sale with no items."})

        provided_discount = "discount" in self.initial_data
        provided_amount_paid = "amount_paid" in self.initial_data
        discount = self.validated_data["discount"] if provided_discount else sale.discount
        amount_paid = self.validated_data["amount_paid"] if provided_amount_paid else sale.amount_paid

        if provided_discount:
            sale.discount = discount
        if provided_amount_paid:
            sale.amount_paid = amount_paid

        subtotal = money(sum(i.total_price for i in sale.items.all()))
        try:
            totals = compute_totals(subtotal, discount, amount_paid)
        except ValueError as exc:
            raise serializers.ValidationError({"discount": str(exc)})
        SaleSerializer()._enforce_amount_paid_bounds(amount_paid, totals["grand_total"])
        sale.total_amount = totals["subtotal"]
        sale.tax = totals["tax"]
        sale.grand_total = totals["grand_total"]
        sale.balance = totals["balance"]
        sale.balance_due = totals["balance"]
        if not sale.is_credit_sale and sale.balance_due > 0:
            raise serializers.ValidationError({"amount_paid": "Non-credit sales require full payment."})
        if sale.is_credit_sale:
            if sale.sale_type != "wholesale":
                raise serializers.ValidationError({"sale_type": "Credit sales must be wholesale."})
            if sale.customer_id is None:
                raise serializers.ValidationError({"customer": "Credit sales require a customer."})
            if sale.assigned_to_id is None:
                raise serializers.ValidationError({"assigned_to": "Credit sales require an assigned delivery person or salesperson."})
        sale.refresh_payment_status()
        sale.save()

        try:
            sale.complete_sale()
        except (ValueError, IntegrityError) as exc:
            raise serializers.ValidationError({"detail": str(exc)})

        return sale


def _build_sale_items(items_data, *, customer, sale_type):
    subtotal = Decimal("0.00")
    sale_items_payload = []
    for item in items_data:
        product = item["product"]
        product_unit = item.get("product_unit")
        if product_unit is None:
            raise serializers.ValidationError({"items": "Product unit is required."})
        if product_unit.product_id != product.id:
            raise serializers.ValidationError({"items": "Product unit does not belong to the product."})
        if not product_unit.is_active:
            raise serializers.ValidationError({"items": "Product unit is inactive."})
        quantity = int(item["quantity"])
        if quantity <= 0:
            raise serializers.ValidationError({"items": "Quantity must be greater than zero."})

        try:
            unit_price, price_type, reason = get_unit_price(
                product_unit=product_unit,
                customer=customer,
                quantity=quantity,
                sale_type=sale_type,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"items": str(exc)})

        conversion = int(product_unit.conversion_to_base_unit)
        if conversion <= 0:
            raise serializers.ValidationError({"items": "Invalid conversion factor."})
        base_quantity = quantity * conversion

        total_price = money(unit_price * quantity)

        subtotal += total_price
        sale_items_payload.append(
            (product, product_unit, quantity, unit_price, total_price, conversion, base_quantity, price_type, reason)
        )

    subtotal = money(subtotal)
    return subtotal, sale_items_payload


def _persist_sale_items(sale, sale_items_payload):
    for product, product_unit, quantity, unit_price, total_price, conversion, base_quantity, price_type, reason in sale_items_payload:
        SaleItem.objects.create(
            sale=sale,
            product=product,
            product_unit=product_unit,
            quantity=quantity,
            unit_price=unit_price,
            total_price=total_price,
            conversion_snapshot=conversion,
            base_quantity=base_quantity,
            price_type_used=price_type,
            pricing_reason=reason,
        )


def _compute_totals(*args, **kwargs):  # backward compatibility shim
    return compute_totals(*args, **kwargs)


class SalePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = [
            "id",
            "sale",
            "customer",
            "amount",
            "payment_method",
            "received_by",
            "payment_date",
            "reference",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class SalePaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_method = serializers.CharField(max_length=50, required=False, allow_blank=True)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)

    def save(self, *, sale, received_by):
        amount = self.validated_data["amount"]
        payment_method = self.validated_data.get("payment_method") or "cash"
        reference = self.validated_data.get("reference") or ""
        note = self.validated_data.get("note") or ""
        return sale.apply_payment(
            amount=amount,
            received_by=received_by,
            payment_method=payment_method,
            reference=reference,
            note=note,
        )
