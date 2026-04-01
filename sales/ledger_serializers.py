from rest_framework import serializers
from .models import LedgerEntry


class LedgerEntrySerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    actor_name = serializers.SerializerMethodField()
    sale_id = serializers.CharField(source="sale.id", read_only=True)
    payment_id = serializers.CharField(source="payment.id", read_only=True)

    class Meta:
        model = LedgerEntry
        fields = [
            "id",
            "created_at",
            "entry_type",
            "direction",
            "amount",
            "description",
            "sale",
            "sale_id",
            "payment",
            "payment_id",
            "customer",
            "customer_name",
            "actor",
            "actor_name",
            "reference",
            "metadata",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor is None:
            return ""
        full_name = f"{obj.actor.first_name or ''} {obj.actor.last_name or ''}".strip()
        if full_name:
            return full_name
        return obj.actor.username or obj.actor.email or ""
