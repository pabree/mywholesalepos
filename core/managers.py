from django.db import models
from django.utils import timezone

class ActiveManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True, deleted_at__isnull=True)
    
class AllObjectsManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset()
    
class SoftDeleteMixin:
    def soft_delete(self):
        self.is_active = False
        self.deleted_at = timezone.now()
        self.save()
        
    def restore(self):
        """Brings a soft-deleted item back to the active list."""
        self.is_active = True
        self.deleted_at = None
        self.save()
     
 # To delete use self.soft_delete(), not self.delete()       
# Instead of Product.objects.all(), use Product.all_objects.all() to see all objects including deleted data 