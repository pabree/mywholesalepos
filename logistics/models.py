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

# Create your models here.
