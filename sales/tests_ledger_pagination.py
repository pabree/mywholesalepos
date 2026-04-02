from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from sales.models import LedgerEntry


class LedgerPaginationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            "admin1",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )
        self.client.force_authenticate(user=self.admin)

    def test_ledger_filter_applies_before_pagination(self):
        LedgerEntry.objects.create(entry_type="sale_payment", direction="in", amount="10.00")
        LedgerEntry.objects.create(entry_type="refund", direction="out", amount="5.00")
        LedgerEntry.objects.create(entry_type="refund", direction="out", amount="6.00")

        res = self.client.get("/api/ledger/?entry_type=refund&limit=1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(len(res.data["results"]), 1)
