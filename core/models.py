from django.db import models
import uuid
from django.conf import settings
from core.middleware import get_current_user

class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correlation_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, ondelete=models.SET_NULL, null=True, blank=True, related_name = 'created_%(class)s_set')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, ondelete=models.SET_NULL, null=True, blank=True, related_name = 'updated_%(class)s_set')
    deleted_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        abstract = True
        
    def save(self, *args, **kwargs):
        user = get_current_user()
        
        if user and user.is_authenticated:
            if not self.pk and not self.created_by:
                self.created_by = user
            self.updated_by = user
        super().save(*args, **kwargs)
        
