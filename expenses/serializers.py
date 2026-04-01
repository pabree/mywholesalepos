from rest_framework import serializers
from .models import Expense
from sales.services import money


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = [
            "id",
            "date",
            "amount",
            "category",
            "description",
            "reference",
            "branch",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
            "is_active",
        ]
        read_only_fields = ["id", "created_at", "created_by", "updated_at", "updated_by"]

    def validate_amount(self, value):
        value = money(value)
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_category(self, value):
        value = (value or "").strip().lower()
        choices = {c[0] for c in Expense.CATEGORY_CHOICES}
        if value not in choices:
            raise serializers.ValidationError("Invalid category.")
        return value
