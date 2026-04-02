from datetime import timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory
from sales.models import Sale, CustomerOrder


class CustomerOrderApiTests(TestCase):
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
        self.unit = ProductUnit.objects.create(
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

        self.customer_user = User.objects.create_user(
            "cust1",
            email="cust1@example.com",
            password="password123",
            first_name="Cust",
            last_name="One",
            role="customer",
        )
        self.customer = Customer.objects.create(
            name="Customer One",
            user=self.customer_user,
            is_wholesale_customer=False,
            can_view_balance=True,
        )

        self.other_user = User.objects.create_user(
            "cust2",
            email="cust2@example.com",
            password="password123",
            first_name="Cust",
            last_name="Two",
            role="customer",
        )
        self.other_customer = Customer.objects.create(
            name="Customer Two",
            user=self.other_user,
            is_wholesale_customer=False,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.customer_user)

    def _order_payload(self, qty=2):
        return {
            "branch": str(self.branch.id),
            "items": [
                {"product": str(self.product.id), "product_unit": str(self.unit.id), "quantity": qty},
            ],
        }

    def test_customer_catalog(self):
        res = self.client.get(f"/api/customer/catalog/?branch={self.branch.id}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.data["results"]) >= 1)
        unit = res.data["results"][0]["units"][0]
        self.assertEqual(unit["display_price"], "15.00")
        self.assertEqual(unit["price_type"], "wholesale")

    def test_customer_can_create_order(self):
        res = self.client.post("/api/customer/orders/", self._order_payload(), format="json")
        self.assertEqual(res.status_code, 201)
        order = CustomerOrder.objects.get(id=res.data["id"])
        self.assertEqual(order.status, "pending")
        self.assertEqual(order.sale.status, "draft")
        self.assertEqual(order.sale.sale_type, "wholesale")

        sale_item = order.sale.items.first()
        self.assertIsNotNone(sale_item)
        self.assertEqual(str(sale_item.unit_price), "15.00")

    def test_customer_credit_request_creates_pending_approval(self):
        payload = self._order_payload()
        payload["credit_requested"] = True
        res = self.client.post("/api/customer/orders/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        order = CustomerOrder.objects.get(id=res.data["id"])
        self.assertEqual(order.status, "pending_credit_approval")
        self.assertTrue(order.credit_requested)
        self.assertEqual(order.credit_approval_status, "pending")
        order.sale.refresh_from_db()
        self.assertFalse(order.sale.is_credit_sale)

    def test_staff_can_approve_credit_request(self):
        payload = self._order_payload()
        payload["credit_requested"] = True
        res = self.client.post("/api/customer/orders/", payload, format="json")
        order_id = res.data["id"]
        order = CustomerOrder.objects.get(id=order_id)

        staff = User.objects.create_user(
            "sales2",
            email="sales2@example.com",
            password="password123",
            first_name="Sales",
            last_name="Two",
            role="salesperson",
        )
        order.sale.assigned_to = staff
        order.sale.save(update_fields=["assigned_to"])

        staff_client = APIClient()
        staff_client.force_authenticate(user=staff)
        approve = staff_client.post(f"/api/sales/customer-orders/{order_id}/credit-approve/", format="json")
        self.assertEqual(approve.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.credit_approval_status, "approved")
        self.assertEqual(order.status, "confirmed")
        order.sale.refresh_from_db()
        self.assertTrue(order.sale.is_credit_sale)

    def test_customer_order_stock_validation(self):
        res = self.client.post("/api/customer/orders/", self._order_payload(qty=20), format="json")
        self.assertEqual(res.status_code, 400)

    def test_customer_order_list_is_scoped(self):
        self.client.post("/api/customer/orders/", self._order_payload(), format="json")

        other_client = APIClient()
        other_client.force_authenticate(user=self.other_user)
        other_client.post("/api/customer/orders/", self._order_payload(), format="json")

        res = self.client.get("/api/customer/orders/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(len(res.data["results"]), 1)

    def test_customer_can_cancel_pending_order(self):
        res = self.client.post("/api/customer/orders/", self._order_payload(), format="json")
        order_id = res.data["id"]

        cancel = self.client.post(f"/api/customer/orders/{order_id}/cancel/")
        self.assertEqual(cancel.status_code, 200)
        order = CustomerOrder.objects.get(id=order_id)
        self.assertEqual(order.status, "cancelled")
        order.sale.refresh_from_db()
        self.assertEqual(order.sale.status, "cancelled")

    def test_customer_balance_summary_requires_permission(self):
        self.customer.can_view_balance = False
        self.customer.save(update_fields=["can_view_balance"])

        res = self.client.get("/api/customer/balance/")
        self.assertEqual(res.status_code, 403)

    def test_customer_balance_summary(self):
        staff = User.objects.create_user(
            "sales1",
            email="sales1@example.com",
            password="password123",
            first_name="Sales",
            last_name="One",
            role="salesperson",
        )
        Sale.objects.create(
            branch=self.branch,
            customer=self.customer,
            sale_type="wholesale",
            total_amount="100.00",
            discount="0.00",
            tax="0.00",
            grand_total="100.00",
            amount_paid="20.00",
            balance="80.00",
            balance_due="80.00",
            status="completed",
            is_credit_sale=True,
            payment_status="partial",
            due_date=timezone.localdate() - timedelta(days=1),
            assigned_to=staff,
        )

        res = self.client.get("/api/customer/balance/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["open_count"], 1)
        self.assertEqual(Decimal(res.data["total_outstanding"]), Decimal("80.00"))
        self.assertEqual(Decimal(res.data["overdue_balance"]), Decimal("80.00"))
