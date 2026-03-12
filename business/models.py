from django.db import models
from core.models import BaseModel
import uuid
# Create your models here.

class Business(BaseModel):
    business_name = models.CharField(max_length=50)
    email = models.EmailField(max_length = 128)
    phone = models.CharField(max_length = 20)
    kra_pin = models.CharField(max_length = 50)

    registration_date = models.DateTimeField(auto_now_add = True)
    
    class Meta:
        db_table = 'businesses'
        verbose_name_plural = "businesses"

    def __str__(self):
        return self.business_name

class Branch(BaseModel):
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="branches")
    branch_name = models.CharField(max_length=100)
    location = models.CharField(max_length=255)
    
    class Meta:
        db_table = 'branches'
        verbose_name_plural = "branches"
    
    def __str__(self):
        return f"{self.branch_name} ({self.business.business_name})"

