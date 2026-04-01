from django.conf import settings
from django.db import models
from core.models import BaseModel
from core.managers import ActiveManager, AllObjectsManager

class Customer(BaseModel):
    name = models.CharField(max_length=255)
    is_wholesale_customer = models.BooleanField(default=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_profile",
    )
    can_view_balance = models.BooleanField(default=False)
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()

    class Meta:
            db_table = 'customers'
