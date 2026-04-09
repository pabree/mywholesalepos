from django.db import models
from core.models import BaseModel
from core.managers import ActiveManager, AllObjectsManager


class Supplier(BaseModel):
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    contact_person = models.CharField(max_length=120, blank=True, default="")
    address = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    objects = ActiveManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "suppliers"
        ordering = ["name", "id"]

    def __str__(self):
        return self.name
