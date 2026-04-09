from rest_framework import serializers
from .models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "contact_person",
            "address",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]
