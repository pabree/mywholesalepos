from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Product


@api_view(["GET"])
def product_by_sku(request, sku):

    try:
        product = Product.objects.get(sku=sku)

        return Response({
            "id": product.id,
            "name": product.name,
            "price": product.selling_price
        })

    except Product.DoesNotExist:
        return Response(
            {"error": "Product not found"},
            status=404
        )