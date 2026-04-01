from django.forms.models import model_to_dict
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.db import connection

from core.middleware import get_current_user
from audit.models import AuditLog

_AUDIT_TABLE_EXISTS = None


def _audit_table_exists():
    global _AUDIT_TABLE_EXISTS
    if _AUDIT_TABLE_EXISTS is None:
        try:
            _AUDIT_TABLE_EXISTS = AuditLog._meta.db_table in connection.introspection.table_names()
        except Exception:
            _AUDIT_TABLE_EXISTS = False
    return _AUDIT_TABLE_EXISTS

def serialize_instance(instance):
    data = model_to_dict(instance)
    return data

@receiver(pre_save)
def log_pre_save(sender, instance, **kwargs):
    # Ignore AuditLog itself and abstract models
    if not hasattr(instance, "_meta"):
        return

    if sender.__name__ == "AuditLog":
        return

    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            instance._old_data = serialize_instance(old_instance)
        except sender.DoesNotExist:
            instance._old_data = None


@receiver(post_save)
def log_post_save(sender, instance, created, **kwargs):
    # return  #  temporary line added before runnning migrations and commented after
    # skip logging during migrations
    if not _audit_table_exists():
        return
    
    if sender.__name__ == "AuditLog":
        return

    if not hasattr(instance, "_meta"):
        return
    
    if kwargs.get('raw', False):
        return

    if getattr(instance, "_skip_audit_log", False):
        return

    user = get_current_user()

    action = "created" if created else "updated"

    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        table_name=sender._meta.db_table,
        record_id=str(instance.pk),
        old_data=getattr(instance, "_old_data", None),
        new_data=serialize_instance(instance),
    )
