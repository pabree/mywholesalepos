from django.db import models
from django.utils import timezone
from core.middleware import get_current_user
from audit.models import AuditLog
from django.forms.models import model_to_dict

class ActiveManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True, deleted_at__isnull=True)
    
class AllObjectsManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset()
    
class SoftDeleteMixin:
    def soft_delete(self):
        user = get_current_user()
        old_data = model_to_dict(self)

        self.is_active = False
        self.deleted_at = timezone.now()
        self._skip_audit_log = True
        self.save()
        del self._skip_audit_log

        AuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            action="deleted",
            table_name=self._meta.db_table,
            record_id=str(self.pk),
            old_data=old_data,
            new_data=None,
        )
        
    def restore(self):
        """Brings a soft-deleted item back to the active list."""
        user = get_current_user()
        old_data = model_to_dict(self)
        
        self.is_active = True
        self.deleted_at = None
        self._skip_audit_log = True
        self.save()
        del self._skip_audit_log
        
        AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action="restored",
        table_name=self._meta.db_table,
        record_id=str(self.pk),
        old_data=old_data,
        new_data=model_to_dict(self), 
    )
     
 # To delete use self.soft_delete(), not self.delete()       
# Instead of Product.objects.all(), use Product.all_objects.all() to see all objects including deleted data 
