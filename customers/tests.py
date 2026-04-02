from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from customers.models import Customer


class CustomerPaginationTests(TestCase):
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
        self.client.force_authenticate(user=self.user)

    def _create_customers(self, count):
        for i in range(count):
            Customer.objects.create(name=f"Customer {i:03d}")

    def test_customer_list_pagination_shape(self):
        self._create_customers(25)
        res = self.client.get("/api/customers/?limit=10")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 25)
        self.assertEqual(len(res.data["results"]), 10)

    def test_customer_list_ordering(self):
        self._create_customers(12)
        res = self.client.get("/api/customers/?limit=5&offset=5")
        self.assertEqual(res.status_code, 200)
        expected = [f"Customer {i:03d}" for i in range(5, 10)]
        actual = [row["name"] for row in res.data["results"]]
        self.assertEqual(actual, expected)
