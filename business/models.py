from django.db import models
from core.models import BaseModel
import uuid
# Create your models here.

class Business(BaseModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correlation_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    business_name = models.CharField(max_length=50)
    email = models.emailField(max_length = 128)
    phone = models.CharField(max_length = 20)
    kra_pin = models.CharField(max_length = 50)

    registration_date = models.DateTimeField(auto_now_add = True)

    def __str__(self):
        return self.business_name


