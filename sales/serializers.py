from rest_framework import serializers
from .models import Sale, SaleItem


class SaleItemSerializer(serializers.ModelSerializer):

    class Meta:
        model = SaleItem
        fields = [
            "product",
            "quantity",
            "unit_price",
            "total_price",
        ]


class SaleSerializer(serializers.ModelSerializer):

    items = SaleItemSerializer(many=True)

    class Meta:
        model = Sale
        fields = [
            "branch",
            "customer",
            "total_amount",
            "discount",
            "tax",
            "grand_total",
            "amount_paid",
            "balance",
            "items",
        ]

    def create(self, validated_data):

        items_data = validated_data.pop("items")

        sale = Sale.objects.create(**validated_data)

        for item in items_data:
            SaleItem.objects.create(
                sale=sale,
                **item
            )

        sale.complete_sale()

        return sale