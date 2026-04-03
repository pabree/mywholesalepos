from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
from core.models import BaseModel
from core.middleware import get_current_user
from inventory.models import Inventory
from inventory.models import StockMovement
from accounts.models import User
from .services import money

# Create your models here.
class Sale(BaseModel):
    SALE_TYPE_CHOICES = [
        ("retail", "Retail"),
        ("wholesale", "Wholesale"),
    ]

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("held", "Held"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]
    PAYMENT_STATUS_CHOICES = [
        ("unpaid", "Unpaid"),
        ("partial", "Partial"),
        ("paid", "Paid"),
        ("overdue", "Overdue"),
    ]
    PAYMENT_MODE_CHOICES = [
        ("cash", "Cash"),
        ("mpesa", "M-Pesa"),
        ("mobile_money", "Mobile Money"),
        ("card", "Card"),
        ("bank", "Bank Transfer"),
        ("credit", "Credit"),
    ]
    branch = models.ForeignKey("business.branch", on_delete=models.CASCADE)
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE)
    sale_type = models.CharField(max_length=20, choices=SALE_TYPE_CHOICES, default="retail")

    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2)
    tax = models.DecimalField(max_digits=10, decimal_places=2)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2)

    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    balance = models.DecimalField(max_digits=10, decimal_places=2)
    balance_due = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    sale_date = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    is_credit_sale = models.BooleanField(default=False)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES, blank=True, null=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default="paid")
    due_date = models.DateField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_sales",
    )
    route_snapshot = models.ForeignKey(
        "logistics.Route",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    completed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_sales",
    )

    def __str__(self):
        return f"Sale #{self.id} - {self.branch}"

    def hold(self):
        if self.status == "completed":
            raise ValueError("Completed sales cannot be held")
        if self.status == "cancelled":
            raise ValueError("Cancelled sales cannot be held")
        self.status = "held"
        self.save(update_fields=["status", "updated_at"])

    def cancel(self):
        if self.status == "completed":
            raise ValueError("Completed sales cannot be cancelled")
        self.status = "cancelled"
        self.save(update_fields=["status", "updated_at"])

    def resume(self):
        if self.status != "held":
            raise ValueError("Only held sales can be resumed")
        self.status = "draft"
        self.save(update_fields=["status", "updated_at"])

    def is_overdue(self, *, today=None):
        today = today or timezone.localdate()
        return self.is_credit_sale and self.balance_due > 0 and self.due_date and self.due_date < today

    def compute_payment_status(self, *, today=None):
        if self.balance_due <= 0:
            return "paid"
        if self.amount_paid <= 0:
            status = "unpaid"
        else:
            status = "partial"
        if self.is_overdue(today=today):
            return "overdue"
        return status

    def refresh_payment_status(self):
        self.payment_status = self.compute_payment_status()
    
    @transaction.atomic
    def complete_sale(self):

        if self.status == "completed":
            raise ValueError("Sale is already completed")
        if self.status == "cancelled":
            raise ValueError("Cancelled sales cannot be completed")
        if self.status not in ("draft", "held"):
            raise ValueError("Sale must be draft or held to complete")
        
        for item in self.items.all():
            try:
                inventory = Inventory.objects.select_for_update().get(
                    branch=self.branch, product=item.product
                )
            except Inventory.DoesNotExist:
                raise ValueError(
                    f"No inventory record for {item.product} at branch {self.branch}"
                )
            if inventory.branch_id != self.branch_id:
                raise ValueError(
                    f"Inventory branch mismatch for {item.product}: {inventory.branch_id} != {self.branch_id}"
                )
            if item.base_quantity <= 0:
                raise ValueError("Base quantity is missing for sale item")
            if inventory.quantity < item.base_quantity:
                raise ValueError(
                    f"Not enough stock for item {item.product}. Available {inventory.quantity}"
                )
            
            previous_qty = inventory.quantity
            inventory.quantity -= item.base_quantity
            inventory.save()

            StockMovement.objects.create(
                inventory=inventory,
                product=item.product,
                branch=inventory.branch,
                sale=self,
                movement_type="sale",
                quantity_change=-item.base_quantity,
                previous_quantity=previous_qty,
                new_quantity=inventory.quantity,
                notes=f"Sale #{self.id} for {self.customer}"

            )

        self.status = "completed"
        self.completed_at = timezone.now()
        if self.route_snapshot_id is None and self.customer and getattr(self.customer, "route_id", None):
            # Snapshot route at completion time for legacy records without a snapshot.
            self.route_snapshot = self.customer.route
        if self.completed_by_id is None:
            current_user = get_current_user()
            self.completed_by = current_user if current_user and current_user.is_authenticated else self.updated_by or self.created_by
        if self.is_credit_sale and not self.due_date:
            self.due_date = (self.completed_at.date() + timedelta(days=3))
        if self.balance_due is None or self.balance_due == Decimal("0.00"):
            self.balance_due = self.balance
        self.refresh_payment_status()
        self.save()
        LedgerEntry.record_sale_completion(sale=self, actor=self.completed_by or self.updated_by)

    @transaction.atomic
    def apply_payment(
        self,
        *,
        amount,
        received_by=None,
        method=None,
        status="completed",
        reference="",
        phone_number="",
        note="",
    ):
        if self.status != "completed":
            raise ValueError("Payments can only be recorded for completed sales.")
        if not self.is_credit_sale:
            raise ValueError("Payments can only be recorded for credit sales.")
        if amount is None:
            raise ValueError("Payment amount is required.")
        amount = money(amount)
        if amount <= 0:
            raise ValueError("Payment amount must be greater than zero.")
        if status == "completed" and self.balance_due <= 0:
            raise ValueError("This sale is already fully paid.")
        if status == "completed" and amount > self.balance_due:
            raise ValueError("Payment amount cannot exceed balance due.")

        payment = SalePayment.objects.create(
            sale=self,
            customer=self.customer,
            amount=amount,
            method=method or "cash",
            status=status or "completed",
            received_by=received_by,
            reference=reference or "",
            phone_number=phone_number or "",
            note=note or "",
        )

        if payment.status == "completed":
            self.amount_paid = money(self.amount_paid + amount)
            self.balance_due = money(max(Decimal("0.00"), self.grand_total - self.amount_paid))
            self.refresh_payment_status()
            self.save(update_fields=["amount_paid", "balance_due", "payment_status", "updated_at"])
            LedgerEntry.record_credit_payment(payment=payment, actor=received_by)
        return payment

    def record_initial_payment(
        self,
        *,
        amount,
        method,
        received_by=None,
        status="completed",
        reference="",
        phone_number="",
        note="",
    ):
        if amount is None:
            raise ValueError("Payment amount is required.")
        amount = money(amount)
        if amount <= 0:
            return None
        return SalePayment.objects.create(
            sale=self,
            customer=self.customer,
            amount=amount,
            method=method or "cash",
            status=status or "completed",
            received_by=received_by,
            reference=reference or "",
            phone_number=phone_number or "",
            note=note or "",
        )

    @transaction.atomic
    def apply_existing_payment(self, payment, *, received_by=None):
        if not payment:
            return None
        if payment.sale_id != self.id:
            raise ValueError("Payment does not belong to this sale.")
        if payment.status != "completed":
            return payment
        if payment.applied_at:
            return payment
        if not self.is_credit_sale:
            raise ValueError("Only credit sales can apply existing payments.")
        amount = money(payment.amount)
        if amount <= 0:
            return payment
        if self.balance_due is not None and amount > self.balance_due:
            raise ValueError("Payment amount cannot exceed balance due.")
        self.amount_paid = money(self.amount_paid + amount)
        self.balance_due = money(max(Decimal("0.00"), self.grand_total - self.amount_paid))
        self.refresh_payment_status()
        self.save(update_fields=["amount_paid", "balance_due", "payment_status", "updated_at"])
        LedgerEntry.record_credit_payment(payment=payment, actor=received_by or payment.received_by)
        payment.applied_at = timezone.now()
        payment.save(update_fields=["applied_at", "updated_at"])
        return payment

# each sale product
class SaleItem(BaseModel):
    sale = models.ForeignKey("Sale", on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("inventory.Product", on_delete = models.CASCADE)
    product_unit = models.ForeignKey(
        "inventory.ProductUnit",
        on_delete=models.PROTECT,
        related_name="sale_items",
        null=True,
        blank=True,
    )

    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    cost_price_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_cost_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_profit_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    conversion_snapshot = models.PositiveIntegerField(default=1)
    base_quantity = models.PositiveIntegerField(default=0)
    price_type_used = models.CharField(max_length=20, blank=True)
    pricing_reason = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"


class SalePayment(BaseModel):
    METHOD_CHOICES = [
        ("cash", "Cash"),
        ("mpesa", "M-Pesa"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    sale = models.ForeignKey("Sale", on_delete=models.CASCADE, related_name="payments")
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="cash")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="completed")
    reference = models.CharField(max_length=120, blank=True, default="")
    phone_number = models.CharField(max_length=20, blank=True, default="")
    provider = models.CharField(max_length=30, blank=True, default="")
    provider_request_id = models.CharField(max_length=120, blank=True, default="")
    provider_checkout_id = models.CharField(max_length=120, blank=True, default="")
    provider_result_code = models.CharField(max_length=20, blank=True, default="")
    provider_result_desc = models.CharField(max_length=255, blank=True, default="")
    provider_metadata = models.JSONField(blank=True, default=dict)
    raw_callback = models.JSONField(blank=True, default=dict)
    received_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_payments",
    )
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_payments",
    )
    payment_date = models.DateTimeField(default=timezone.now)
    note = models.TextField(blank=True, default="")
    verified_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-payment_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                condition=Q(reference__gt="", method="mpesa"),
                name="uniq_mpesa_reference",
            ),
            models.UniqueConstraint(
                fields=["provider_checkout_id"],
                condition=Q(provider_checkout_id__gt="", provider="mpesa"),
                name="uniq_mpesa_checkout_id",
            ),
        ]

    def __str__(self):
        return f"Payment {self.amount} for Sale {self.sale_id}"


class SaleReturn(BaseModel):
    sale = models.ForeignKey("sales.Sale", on_delete=models.CASCADE, related_name="returns")
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE)
    processed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_returns",
    )
    reason = models.TextField(blank=True, default="")
    total_refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Return {self.id} for Sale {self.sale_id}"


class SaleReturnItem(BaseModel):
    sale_return = models.ForeignKey("sales.SaleReturn", on_delete=models.CASCADE, related_name="items")
    sale_item = models.ForeignKey("sales.SaleItem", on_delete=models.PROTECT, related_name="return_items")
    quantity_returned = models.PositiveIntegerField()
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2)
    restock_to_inventory = models.BooleanField(default=True)
    base_quantity_returned = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Return item {self.sale_item_id} qty {self.quantity_returned}"


class LedgerEntry(BaseModel):
    ENTRY_TYPE_CHOICES = [
        ("sale_payment", "Sale payment"),
        ("credit_payment", "Credit payment"),
        ("manual_adjustment", "Manual adjustment"),
        ("refund", "Refund"),
    ]
    DIRECTION_CHOICES = [
        ("in", "Inflow"),
        ("out", "Outflow"),
    ]

    entry_type = models.CharField(max_length=40, choices=ENTRY_TYPE_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default="in")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True, default="")
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    payment = models.ForeignKey(
        "sales.SalePayment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    reference = models.CharField(max_length=120, blank=True, default="")
    metadata = models.JSONField(blank=True, default=dict)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["payment"],
                condition=Q(payment__isnull=False),
                name="uniq_ledger_payment",
            ),
            models.UniqueConstraint(
                fields=["sale", "entry_type"],
                condition=Q(payment__isnull=True),
                name="uniq_ledger_sale_entry_type",
            ),
        ]

    def __str__(self):
        return f"{self.entry_type} {self.amount}"

    @classmethod
    def record_sale_completion(cls, *, sale, actor=None):
        if not sale:
            return None
        if sale.grand_total is None:
            return None
        amount_paid = money(sale.amount_paid)
        amount = money(min(amount_paid, money(sale.grand_total)))
        if amount <= 0:
            return None
        entry_type = "credit_payment" if sale.is_credit_sale else "sale_payment"
        defaults = {
            "direction": "in",
            "amount": amount,
            "description": f"{'Credit' if sale.is_credit_sale else 'Sale'} payment for Sale #{sale.id}",
            "customer": sale.customer,
            "actor": actor,
            "reference": "",
            "metadata": {
                "sale_type": sale.sale_type,
                "payment_mode": sale.payment_mode,
            },
        }
        entry, _ = cls.objects.get_or_create(
            sale=sale,
            payment=None,
            entry_type=entry_type,
            defaults=defaults,
        )
        return entry

    @classmethod
    def record_credit_payment(cls, *, payment, actor=None):
        if not payment:
            return None
        amount = money(payment.amount)
        if amount <= 0:
            return None
        defaults = {
            "direction": "in",
            "amount": amount,
            "description": f"Credit payment for Sale #{payment.sale_id}",
            "sale": payment.sale,
            "customer": payment.customer,
            "actor": actor or payment.received_by,
            "reference": payment.reference or "",
            "metadata": {
                "payment_method": payment.method or "",
            },
        }
        entry, _ = cls.objects.get_or_create(
            payment=payment,
            defaults=defaults,
        )
        return entry

    @classmethod
    def record_refund(cls, *, sale_return, actor=None):
        if not sale_return:
            return None
        amount = money(sale_return.total_refund_amount)
        if amount <= 0:
            return None
        reference = f"return:{sale_return.id}"
        if cls.objects.filter(entry_type="refund", reference=reference).exists():
            return None
        entry = cls.objects.create(
            entry_type="refund",
            direction="out",
            amount=amount,
            description=f"Refund for Sale #{sale_return.sale_id}",
            sale=sale_return.sale,
            customer=sale_return.customer,
            actor=actor,
            reference=reference,
            metadata={"sale_return_id": str(sale_return.id)},
        )
        return entry

class CustomerOrder(BaseModel):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("pending_credit_approval", "Pending credit approval"),
        ("confirmed", "Confirmed"),
        ("processing", "Processing"),
        ("out_for_delivery", "Out for delivery"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]
    CREDIT_APPROVAL_CHOICES = [
        ("not_requested", "Not requested"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    sale = models.OneToOneField(
        "sales.Sale",
        on_delete=models.CASCADE,
        related_name="customer_order",
    )
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="pending")
    credit_requested = models.BooleanField(default=False)
    credit_approval_status = models.CharField(
        max_length=24,
        choices=CREDIT_APPROVAL_CHOICES,
        default="not_requested",
    )
    credit_approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_approvals",
    )
    credit_approved_at = models.DateTimeField(null=True, blank=True)
    credit_rejection_reason = models.TextField(blank=True, default="")
    placed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_orders",
    )

    class Meta:
        db_table = "customer_orders"

    def __str__(self):
        return f"CustomerOrder {self.id} - {self.status}"
    
