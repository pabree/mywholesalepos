from django.db import models
from core.models import BaseModel


class Route(BaseModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True, default="")
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="routes",
    )

    class Meta:
        verbose_name = "Route"
        verbose_name_plural = "Routes"

    def __str__(self):
        return self.name


class DeliveryRun(BaseModel):
    STATUS_CHOICES = [
        ("assigned", "Assigned"),
        ("picked_up", "Picked up"),
        ("en_route", "En route"),
        ("arrived", "Arrived"),
        ("delivered", "Delivered"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    ]

    order = models.OneToOneField(
        "sales.CustomerOrder",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="delivery_run",
    )
    sale = models.OneToOneField(
        "sales.Sale",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="delivery_run",
    )
    delivery_person = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_runs",
    )
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.CASCADE,
        related_name="delivery_runs",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="assigned")
    assigned_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    start_latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    start_longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    end_latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    end_longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    last_known_latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    last_known_longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    last_ping_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    recipient_name = models.CharField(max_length=150, blank=True, default="")
    recipient_phone = models.CharField(max_length=50, blank=True, default="")
    delivery_notes = models.TextField(blank=True, default="")
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.id} ({self.status})"


class DeliveryLocationPing(BaseModel):
    delivery_run = models.ForeignKey(
        DeliveryRun,
        on_delete=models.CASCADE,
        related_name="pings",
    )
    delivery_person = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_location_pings",
    )
    latitude = models.DecimalField(max_digits=10, decimal_places=6)
    longitude = models.DecimalField(max_digits=10, decimal_places=6)
    accuracy_meters = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    speed_kph = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    heading_degrees = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    battery_level = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    recorded_at = models.DateTimeField()

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"Ping {self.delivery_run_id} @ {self.recorded_at}"
