from django.db import models
import uuid
from django.conf import settings
from core.middleware import get_current_user

class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correlation_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name = 'created_%(class)s_set')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name = 'updated_%(class)s_set')
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


class SystemBackup(models.Model):
    BACKUP_TYPE_CHOICES = [
        ("manual", "Manual"),
        ("scheduled", "Scheduled"),
    ]
    STATUS_CHOICES = [
        ("success", "Success"),
        ("failed", "Failed"),
    ]
    REMOTE_STATUS_CHOICES = [
        ("success", "Success"),
        ("failed", "Failed"),
        ("skipped", "Skipped"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    backup_type = models.CharField(max_length=20, choices=BACKUP_TYPE_CHOICES, default="manual")
    file_name = models.CharField(max_length=255)
    storage_path = models.TextField()
    size_bytes = models.BigIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="success")
    error_message = models.TextField(blank=True, default="")
    remote_storage_type = models.CharField(max_length=20, blank=True, default="")
    remote_storage_key = models.TextField(blank=True, default="")
    remote_upload_status = models.CharField(
        max_length=20, choices=REMOTE_STATUS_CHOICES, blank=True, default="skipped"
    )
    remote_error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_system_backups",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.file_name} ({self.status})"
        
