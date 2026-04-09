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
