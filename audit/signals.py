import json
from django.forms.models import model_to_dict
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from core.middleware import get_current_user
from audit.models import AuditLog

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
    
    if sender.__name__ == "AuditLog":
        return

    if not hasattr(instance, "_meta"):
        return
    
    if kwargs.get('raw', False):
        return

    user = get_current_user()

    action = "created" if created else "updated"

    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        table_name=sender._meta.db_table,
        record_id=instance.pk,
        old_data=getattr(instance, "_old_data", None),
        new_data=serialize_instance(instance),
    )