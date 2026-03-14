from core.models import BaseModel
from core.managers import ActiveManager, AllObjectsManager
from django.db import models

class Customer(BaseModel):
    name = models.CharField(max_length=255)
    
    objects = ActiveManager()
    all_objects = AllObjectsManager

    class Meta:
            db_table = 'customers'