from django.db import models
from django.utils import timezone
from django.db.models import Q
from core.models import BaseModel


class PurchaseOrder(BaseModel):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("ordered", "Ordered"),
        ("partial", "Partially received"),
        ("received", "Received"),
        ("cancelled", "Cancelled"),
    ]

    po_number = models.CharField(max_length=32, unique=True)
    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.CASCADE,
        related_name="purchase_orders",
    )
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.CASCADE,
        related_name="purchase_orders",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    ordered_at = models.DateTimeField(null=True, blank=True)
    expected_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.po_number

    def mark_ordered(self):
        if not self.ordered_at:
            self.ordered_at = timezone.now()
        if self.status == "draft":
            self.status = "ordered"

    def compute_status(self):
        lines = list(self.lines.all())
        if not lines:
            return self.status
        all_received = all(line.received_quantity >= line.ordered_quantity for line in lines)
        any_received = any(line.received_quantity > 0 for line in lines)
        if all_received:
            return "received"
        if any_received:
            return "partial"
        return self.status if self.status != "received" else "partial"


class PurchaseOrderLine(BaseModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.CASCADE,
        related_name="purchase_lines",
    )
    ordered_quantity = models.PositiveIntegerField()
    received_quantity = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["purchase_order", "product"],
                name="uniq_purchase_order_product",
            ),
            models.CheckConstraint(
                condition=Q(ordered_quantity__gte=0),
                name="purchase_line_ordered_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(received_quantity__gte=0),
                name="purchase_line_received_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.purchase_order.po_number} - {self.product}"

    @property
    def remaining_quantity(self):
        return max(0, (self.ordered_quantity or 0) - (self.received_quantity or 0))


class SupplierBill(BaseModel):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("open", "Open"),
        ("partial", "Partially paid"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]

    bill_number = models.CharField(max_length=32, unique=True)
    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.CASCADE,
        related_name="bills",
    )
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.CASCADE,
        related_name="supplier_bills",
    )
    purchase_order = models.OneToOneField(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="supplier_bill",
    )
    bill_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.bill_number


class SupplierBillLine(BaseModel):
    supplier_bill = models.ForeignKey(
        SupplierBill,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supplier_bill_lines",
    )
    purchase_order_line = models.ForeignKey(
        PurchaseOrderLine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supplier_bill_lines",
    )
    description = models.CharField(max_length=200, blank=True, default="")
    quantity = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.supplier_bill.bill_number} - {self.description or self.product}"


class SupplierLedgerEntry(BaseModel):
    ENTRY_TYPE_CHOICES = [
        ("supplier_bill", "Supplier bill"),
        ("supplier_payment", "Supplier payment"),
        ("adjustment", "Adjustment"),
    ]
    DIRECTION_CHOICES = [
        ("in", "Inflow"),
        ("out", "Outflow"),
    ]

    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.CASCADE,
        related_name="ledger_entries",
    )
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.CASCADE,
        related_name="supplier_ledger_entries",
    )
    entry_type = models.CharField(max_length=40, choices=ENTRY_TYPE_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default="out")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference = models.CharField(max_length=120, blank=True, default="")
    bill = models.ForeignKey(
        SupplierBill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.entry_type} {self.amount}"
