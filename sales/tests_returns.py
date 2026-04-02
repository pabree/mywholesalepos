from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory
from sales.models import Sale, LedgerEntry


class SaleReturnTests(TestCase):
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
        self.wholesale_customer = Customer.objects.create(
            name="Wholesale Customer",
            is_wholesale_customer=True,
        )
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
            quantity=10,
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
        self.delivery_user = User.objects.create_user(
            "deliver1",
            email="deliver@example.com",
            password="password123",
            first_name="Delivery",
            last_name="One",
            role="deliver_person",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.cashier)

    def _payload(self, qty=2, sale_type="retail", credit=False):
        payload = {
            "branch": str(self.branch.id),
            "customer": str(self.customer.id),
            "sale_type": sale_type,
            "discount": "0.00",
            "amount_paid": "0.00",
            "items": [
                {"product": str(self.product.id), "product_unit": str(self.base_unit.id), "quantity": qty},
            ],
        }
        if credit:
            payload["sale_type"] = "wholesale"
            payload["customer"] = str(self.wholesale_customer.id)
            payload["is_credit_sale"] = True
            payload["assigned_to"] = str(self.delivery_user.id)
            payload["payment_mode"] = "credit"
        return payload

    def _complete_sale(self, sale_id, amount_paid):
        return self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(amount_paid)},
            format="json",
        )

    def test_full_return_restock(self):
        res = self.client.post("/api/sales/", self._payload(qty=2), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(sale_id, sale.grand_total)

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 8)

        sale_item = sale.items.first()
        payload = {
            "items": [
                {"sale_item": str(sale_item.id), "quantity_returned": 2, "restock_to_inventory": True},
            ]
        }
        ret = self.client.post(f"/api/sales/{sale_id}/returns/", payload, format="json")
        self.assertEqual(ret.status_code, 201)

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)

        entry = LedgerEntry.objects.filter(entry_type="refund", sale_id=sale_id).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.direction, "out")

    def test_partial_return_no_restock(self):
        res = self.client.post("/api/sales/", self._payload(qty=2), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(sale_id, sale.grand_total)

        sale_item = sale.items.first()
        payload = {
            "items": [
                {"sale_item": str(sale_item.id), "quantity_returned": 1, "restock_to_inventory": False},
            ]
        }
        ret = self.client.post(f"/api/sales/{sale_id}/returns/", payload, format="json")
        self.assertEqual(ret.status_code, 201)

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 8)

    def test_over_return_blocked(self):
        res = self.client.post("/api/sales/", self._payload(qty=1), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(sale_id, sale.grand_total)

        sale_item = sale.items.first()
        payload = {
            "items": [
                {"sale_item": str(sale_item.id), "quantity_returned": 2, "restock_to_inventory": True},
            ]
        }
        ret = self.client.post(f"/api/sales/{sale_id}/returns/", payload, format="json")
        self.assertEqual(ret.status_code, 400)

    def test_only_completed_sales_returnable(self):
        res = self.client.post("/api/sales/", self._payload(qty=1), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self.assertEqual(sale.status, "draft")

        sale_item = sale.items.first()
        payload = {
            "items": [
                {"sale_item": str(sale_item.id), "quantity_returned": 1, "restock_to_inventory": True},
            ]
        }
        ret = self.client.post(f"/api/sales/{sale_id}/returns/", payload, format="json")
        self.assertEqual(ret.status_code, 400)

    def test_credit_refund_reduces_balance_due(self):
        res = self.client.post("/api/sales/", self._payload(qty=2, credit=True), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(sale_id, Decimal("5.00"))
        sale.refresh_from_db()
        original_balance = sale.balance_due

        sale_item = sale.items.first()
        payload = {
            "items": [
                {"sale_item": str(sale_item.id), "quantity_returned": 1, "restock_to_inventory": True},
            ]
        }
        ret = self.client.post(f"/api/sales/{sale_id}/returns/", payload, format="json")
        self.assertEqual(ret.status_code, 201)

        sale.refresh_from_db()
        self.assertLess(sale.balance_due, original_balance)
