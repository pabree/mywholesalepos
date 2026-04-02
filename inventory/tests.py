from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from inventory.models import Category, Product


class ProductPaginationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            "cashier1",
            email="cashier@example.com",
            password="password123",
            first_name="Cash",
            last_name="User",
            role="cashier",
        )
        self.category = Category.objects.create(name="Snacks")
        self.client.force_authenticate(user=self.user)

    def _create_products(self, count):
        for i in range(count):
            Product.objects.create(
                name=f"Product {i:03d}",
                sku=f"SKU-{i:03d}",
                category=self.category,
                cost_price="10.00",
                selling_price="20.00",
                retail_price="20.00",
            )

    def test_product_list_pagination_shape_and_limit(self):
        self._create_products(30)
        res = self.client.get("/api/inventory/products/?limit=10")
        self.assertEqual(res.status_code, 200)
        self.assertIn("count", res.data)
        self.assertIn("results", res.data)
        self.assertEqual(res.data["count"], 30)
        self.assertEqual(len(res.data["results"]), 10)

    def test_product_list_offset_and_ordering(self):
        self._create_products(12)
        res = self.client.get("/api/inventory/products/?limit=5&offset=5")
        self.assertEqual(res.status_code, 200)
        expected = [f"Product {i:03d}" for i in range(5, 10)]
        actual = [row["name"] for row in res.data["results"]]
        self.assertEqual(actual, expected)

    def test_product_list_max_limit_enforced(self):
        self._create_products(150)
        res = self.client.get("/api/inventory/products/?limit=500")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 150)
        self.assertEqual(len(res.data["results"]), 100)
