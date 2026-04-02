from django.test import TestCase
from rest_framework.test import APIClient
from business.models import Business, Branch
from accounts.models import User
from expenses.models import Expense


class ExpenseApiTests(TestCase):
    def setUp(self):
        self.business = Business.objects.create(
            business_name="Test Biz",
            email="biz@example.com",
            phone="123456789",
            kra_pin="A000000000A",
        )
        self.branch = Branch.objects.create(
            business=self.business,
            branch_name="Main",
            location="Nairobi",
        )
        self.admin = User.objects.create_user(
            "admin1",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )
        self.cashier = User.objects.create_user(
            "cashier1",
            email="cashier@example.com",
            password="password123",
            first_name="Cashier",
            last_name="One",
            role="cashier",
        )
        self.client = APIClient()

    def test_admin_can_create_expense(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "date": "2026-03-31",
            "amount": "25.00",
            "category": "fuel",
            "description": "Delivery fuel",
            "reference": "RCPT-01",
            "branch": str(self.branch.id),
        }
        res = self.client.post("/api/expenses/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Expense.objects.count(), 1)

    def test_non_admin_cannot_access_expenses(self):
        self.client.force_authenticate(user=self.cashier)
        res = self.client.get("/api/expenses/")
        self.assertEqual(res.status_code, 403)

        export = self.client.get("/api/expenses/export/?format=csv")
        self.assertEqual(export.status_code, 403)

    def test_expense_category_validation(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "date": "2026-03-31",
            "amount": "25.00",
            "category": "invalid",
        }
        res = self.client.post("/api/expenses/", payload, format="json")
        self.assertEqual(res.status_code, 400)

    def test_expense_filters_and_export(self):
        self.client.force_authenticate(user=self.admin)
        Expense.objects.create(
            date="2026-03-30",
            amount="10.00",
            category="fuel",
            branch=self.branch,
        )
        Expense.objects.create(
            date="2026-03-31",
            amount="20.00",
            category="rent",
            branch=self.branch,
        )

        res = self.client.get("/api/expenses/?date_from=2026-03-31&category=rent&limit=1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(len(res.data["results"]), 1)

        export = self.client.get("/api/expenses/export/?format=csv")
        self.assertEqual(export.status_code, 200)
        self.assertIn("text/csv", export["Content-Type"])
