from django.db import models
from django.utils import timezone
from core.models import BaseModel


class Expense(BaseModel):
    CATEGORY_CHOICES = [
        ("transport", "Transport"),
        ("rent", "Rent"),
        ("utilities", "Utilities"),
        ("wages", "Wages"),
        ("fuel", "Fuel"),
        ("packaging", "Packaging"),
        ("maintenance", "Maintenance"),
        ("miscellaneous", "Miscellaneous"),
    ]
    date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(max_length=120, choices=CATEGORY_CHOICES, default="miscellaneous")
    description = models.TextField(blank=True, default="")
    reference = models.CharField(max_length=120, blank=True, default="")
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.category} - {self.amount}"
