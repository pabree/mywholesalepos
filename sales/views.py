from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import api_view
from .models import Sale

from .serializers import SaleSerializer


class CreateSaleView(APIView):

    def post(self, request):

        serializer = SaleSerializer(data=request.data)

        if serializer.is_valid():
            sale = serializer.save()

            return Response(
                {"message": "Sale completed", "sale_id": sale.id},
                status=status.HTTP_201_CREATED
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
@api_view(["GET"])
def sale_receipt(request, sale_id):

    try:
        sale = Sale.objects.get(id=sale_id)

        items = []

        for item in sale.items.all():
            items.append({
                "product": item.product.name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total": item.total_price
            })

        receipt = {
            "sale_id": sale.id,
            "date": sale.sale_date,
            "items": items,
            "total": sale.grand_total,
            "paid": sale.amount_paid,
            "balance": sale.balance
        }

        return Response(receipt)

    except Sale.DoesNotExist:
        return Response({"error": "Sale not found"}, status=404)