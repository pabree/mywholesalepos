from django.db import models
import json
from django.conf import settings
from core.models import BaseModel
from django.core.serializers.json import DjangoJSONEncoder

class AuditLog(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    
    action = models.CharField(max_length=50)
    table_name= models.CharField(max_length=255, db_index=True)
    record_id = models.CharField(max_length=64, db_index=True)
    old_data = models.JSONField(encoder=DjangoJSONEncoder, null=True, blank=True)
    new_data = models.JSONField(encoder=DjangoJSONEncoder, null=True, blank=True)
    
    class Meta:
        db_table = 'audit_log'
        
    def __str__(self):
        return f"{self.table_name} - {self.action}"
