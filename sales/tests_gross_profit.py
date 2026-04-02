from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory
from sales.models import Sale


class GrossProfitTests(TestCase):
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
        self.customer = Customer.objects.create(name="Walk-in Customer")
        self.category = Category.objects.create(name="Beverages")
        self.product = Product.objects.create(
            name="Cola",
            sku="COLA-001",
            category=self.category,
            cost_price="10.00",
            selling_price="20.00",
            retail_price="20.00",
            wholesale_price="15.00",
            wholesale_threshold=5,
        )
        self.base_unit = ProductUnit.objects.create(
            product=self.product,
            unit_name="Piece",
            unit_code="piece",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="20.00",
            wholesale_price="15.00",
            wholesale_threshold=5,
        )
        self.inventory = Inventory.objects.create(
            branch=self.branch,
            product=self.product,
            quantity=20,
            reorder_level=2,
        )
        self.cashier = User.objects.create_user(
            "cashier1",
            email="cashier@example.com",
            password="password123",
            first_name="Cashier",
            last_name="One",
            role="cashier",
        )
        self.admin = User.objects.create_user(
            "admin1",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.cashier)

    def _sale_payload(self, qty=2):
        return {
            "branch": str(self.branch.id),
            "customer": str(self.customer.id),
            "sale_type": "retail",
            "discount": "0.00",
            "amount_paid": "0.00",
            "items": [
                {"product": str(self.product.id), "product_unit": str(self.base_unit.id), "quantity": qty},
            ],
        }

    def _complete_sale(self, sale_id, amount_paid):
        return self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(amount_paid)},
            format="json",
        )

    def test_sale_item_cost_snapshots(self):
        res = self.client.post("/api/sales/", self._sale_payload(qty=2), format="json")
        self.assertEqual(res.status_code, 201)
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        item = sale.items.first()
        self.assertEqual(item.cost_price_snapshot, Decimal("10.00"))
        self.assertEqual(item.total_cost_snapshot, Decimal("20.00"))
        self.assertEqual(item.gross_profit_snapshot, Decimal("20.00"))

    def test_gross_profit_summary_with_return(self):
        res = self.client.post("/api/sales/", self._sale_payload(qty=2), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(sale_id, sale.grand_total)

        sale_item = sale.items.first()
        payload = {
            "items": [
                {"sale_item": str(sale_item.id), "quantity_returned": 1, "restock_to_inventory": True},
            ]
        }
        ret = self.client.post(f"/api/sales/{sale_id}/returns/", payload, format="json")
        self.assertEqual(ret.status_code, 201)

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        summary = admin_client.get("/api/ledger/summary/")
        self.assertEqual(summary.status_code, 200)

        expected_gross_profit = (
            sale.grand_total - Decimal("20.00")
        ) - (Decimal("20.00") - Decimal("10.00"))
        self.assertEqual(Decimal(str(summary.data["gross_profit_today"])), expected_gross_profit)
        self.assertEqual(Decimal(str(summary.data["gross_profit_month"])), expected_gross_profit)
