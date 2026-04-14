from rest_framework import serializers


class SalesByDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    total_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_orders = serializers.IntegerField()


class SalesByPaymentMethodSerializer(serializers.Serializer):
    payment_method = serializers.CharField()
    total_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_orders = serializers.IntegerField()


class SalesSummarySerializer(serializers.Serializer):
    total_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_orders = serializers.IntegerField()
    average_order_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    sales_by_day = SalesByDaySerializer(many=True)
    sales_by_payment_method = SalesByPaymentMethodSerializer(many=True)


class TopProductSerializer(serializers.Serializer):
    product_id = serializers.CharField()
    product_name = serializers.CharField()
    total_quantity = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)


class TopProductsSerializer(serializers.Serializer):
    top_products = TopProductSerializer(many=True)


class LowStockProductSerializer(serializers.Serializer):
    product_id = serializers.CharField()
    product_name = serializers.CharField()
    sku = serializers.CharField()
    quantity = serializers.IntegerField()
    reorder_level = serializers.IntegerField()
    branch_id = serializers.CharField(allow_null=True)
    branch_name = serializers.CharField(allow_null=True)


class InventorySummarySerializer(serializers.Serializer):
    low_stock_count = serializers.IntegerField()
    out_of_stock_count = serializers.IntegerField()
    low_stock_products = LowStockProductSerializer(many=True)


class DashboardSummarySerializer(serializers.Serializer):
    today_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    week_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_orders_count = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    top_products = TopProductSerializer(many=True)
