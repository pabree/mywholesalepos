from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q
from accounts.permissions import RolePermission
from .models import Product
from core.pagination import StandardLimitOffsetPagination


class ProductBySkuView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, sku):
        try:
            product = Product.objects.get(sku=sku)
        except Product.DoesNotExist:
            return Response({"error": "Product not found"}, status=404)

        return Response(
            {
                "id": product.id,
                "name": product.name,
                "price": product.retail_price or product.selling_price,
            }
        )


class ProductListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        """List all active products with their category, prices, and current stock."""
        branch_id = request.query_params.get("branch")
        products = Product.objects.select_related("category").prefetch_related("units")

        if branch_id:
            products = products.annotate(
                stock=Sum("inventory__quantity", filter=Q(inventory__branch_id=branch_id))
            )
        else:
            products = products.annotate(stock=Sum("inventory__quantity"))

        products = products.order_by("name", "sku")

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(products, request, view=self)
        page = page if page is not None else products

        data = []
        for product in page:
            total_stock = int(product.stock or 0)

            data.append({
                "id": str(product.id),
                "name": product.name,
                "sku": product.sku,
                "category": product.category.name if product.category else None,
                "cost_price": str(product.cost_price),
                "selling_price": str(product.retail_price or product.selling_price),
                "retail_price": str(product.retail_price or product.selling_price),
                "wholesale_price": str(product.wholesale_price) if product.wholesale_price is not None else None,
                "wholesale_threshold": product.wholesale_threshold,
                "units": [
                    {
                        "id": str(u.id),
                        "unit_name": u.unit_name,
                        "unit_code": u.unit_code,
                        "conversion_to_base_unit": u.conversion_to_base_unit,
                        "is_base_unit": u.is_base_unit,
                        "retail_price": str(u.retail_price) if u.retail_price is not None else None,
                        "wholesale_price": str(u.wholesale_price) if u.wholesale_price is not None else None,
                        "wholesale_threshold": u.wholesale_threshold,
                    }
                    for u in product.units.filter(is_active=True)
                ],
                "stock": total_stock,
            })

        if page is not products:
            return paginator.get_paginated_response(data)
        return Response(data)
