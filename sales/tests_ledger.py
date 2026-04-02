from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory
from sales.models import Sale, LedgerEntry


class LedgerEntryTests(TestCase):
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
        self.delivery_user = User.objects.create_user(
            "deliver1",
            email="deliver@example.com",
            password="password123",
            first_name="Delivery",
            last_name="One",
            role="deliver_person",
        )
        self.admin = User.objects.create_user(
            "admin1",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )
        self.superuser = User.objects.create_user(
            "super1",
            email="super@example.com",
            password="password123",
            first_name="Super",
            last_name="User",
            role="cashier",
            is_superuser=True,
            is_staff=True,
        )
        self.client = APIClient()

    def _payload(self, *, qty=2, sale_type="retail", is_credit_sale=False, assigned_to=None):
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
        if is_credit_sale:
            payload["sale_type"] = "wholesale"
            payload["customer"] = str(self.wholesale_customer.id)
            payload["is_credit_sale"] = True
            payload["assigned_to"] = str(assigned_to.id)
            payload["payment_mode"] = "credit"
        return payload

    def test_non_credit_completion_creates_ledger_entry(self):
        self.client.force_authenticate(user=self.cashier)
        res = self.client.post("/api/sales/", self._payload(), format="json")
        self.assertEqual(res.status_code, 201)
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)

        complete = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )
        self.assertEqual(complete.status_code, 200)

        entry = LedgerEntry.objects.get(sale_id=sale_id, entry_type="sale_payment")
        self.assertEqual(entry.amount, sale.grand_total)

    def test_credit_completion_creates_upfront_ledger_entry(self):
        self.client.force_authenticate(user=self.cashier)
        res = self.client.post(
            "/api/sales/",
            self._payload(is_credit_sale=True, assigned_to=self.delivery_user),
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale_id = res.data["id"]

        complete = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": "10.00"},
            format="json",
        )
        self.assertEqual(complete.status_code, 200)

        entry = LedgerEntry.objects.get(sale_id=sale_id, entry_type="credit_payment", payment__isnull=True)
        self.assertEqual(entry.amount, Decimal("10.00"))

    def test_credit_payment_creates_ledger_entry(self):
        self.client.force_authenticate(user=self.cashier)
        res = self.client.post(
            "/api/sales/",
            self._payload(is_credit_sale=True, assigned_to=self.delivery_user),
            format="json",
        )
        sale_id = res.data["id"]
        self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": "5.00"},
            format="json",
        )

        payment_res = self.client.post(
            f"/api/sales/{sale_id}/payments/",
            {"amount": "3.00", "payment_method": "cash"},
            format="json",
        )
        self.assertEqual(payment_res.status_code, 201)
        payment_id = payment_res.data["payment_id"]

        entry = LedgerEntry.objects.get(payment_id=payment_id)
        self.assertEqual(entry.entry_type, "credit_payment")
        self.assertEqual(entry.amount, Decimal("3.00"))

    def test_ledger_endpoints_admin_only(self):
        self.client.force_authenticate(user=self.cashier)
        res = self.client.get("/api/ledger/")
        self.assertEqual(res.status_code, 403)

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        res_admin = admin_client.get("/api/ledger/")
        self.assertEqual(res_admin.status_code, 200)

        super_client = APIClient()
        super_client.force_authenticate(user=self.superuser)
        res_super = super_client.get("/api/ledger/")
        self.assertEqual(res_super.status_code, 200)

    def test_ledger_actor_name_serialization(self):
        from sales.models import LedgerEntry
        entry = LedgerEntry.objects.create(
            entry_type="sale_payment",
            direction="in",
            amount="10.00",
            actor=self.admin,
        )
        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        res = admin_client.get("/api/ledger/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data)
        actor_name = res.data[0].get("actor_name")
        self.assertTrue(actor_name)

    def test_finance_export_csv(self):
        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        res = admin_client.get("/api/finance/export/?format=csv")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])

        self.client.force_authenticate(user=self.cashier)
        res_forbidden = self.client.get("/api/finance/export/?format=csv")
        self.assertEqual(res_forbidden.status_code, 403)

    def test_ledger_summary_totals(self):
        self.client.force_authenticate(user=self.cashier)
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )

        credit_res = self.client.post(
            "/api/sales/",
            self._payload(is_credit_sale=True, assigned_to=self.delivery_user),
            format="json",
        )
        credit_sale_id = credit_res.data["id"]
        credit_sale = Sale.objects.get(id=credit_sale_id)
        self.client.post(
            f"/api/sales/{credit_sale_id}/complete/",
            {"amount_paid": "5.00"},
            format="json",
        )
        self.client.post(
            f"/api/sales/{credit_sale_id}/payments/",
            {"amount": "3.00", "payment_method": "cash"},
            format="json",
        )
        credit_sale.refresh_from_db()
        credit_sale.due_date = credit_sale.due_date - timedelta(days=1)
        credit_sale.save(update_fields=["due_date"])

        from expenses.models import Expense
        Expense.objects.create(
            date=credit_sale.completed_at.date(),
            amount="2.00",
            category="fuel",
            branch=self.branch,
        )

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        summary = admin_client.get("/api/ledger/summary/")
        self.assertEqual(summary.status_code, 200)
        expected_sales_today = sale.grand_total + credit_sale.grand_total
        expected_collected_today = sale.grand_total + Decimal("5.00") + Decimal("3.00")
        expected_credit_issued = credit_sale.grand_total - Decimal("5.00")
        expected_expenses_month = Decimal("2.00")
        expected_net_position = expected_collected_today - expected_expenses_month
        expected_gross_profit = (
            (sale.grand_total - Decimal("20.00"))
            + (credit_sale.grand_total - Decimal("20.00"))
        )
        expected_gross_margin = (expected_gross_profit / expected_sales_today * Decimal("100")).quantize(Decimal("0.01"))
        self.assertEqual(Decimal(str(summary.data["sales_today"])), expected_sales_today)
        self.assertEqual(Decimal(str(summary.data["sales_week"])), expected_sales_today)
        self.assertEqual(Decimal(str(summary.data["sales_month"])), expected_sales_today)
        self.assertEqual(Decimal(str(summary.data["gross_profit_today"])), expected_gross_profit)
        self.assertEqual(Decimal(str(summary.data["gross_profit_month"])), expected_gross_profit)
        self.assertEqual(Decimal(str(summary.data["gross_margin_percent_month"])), expected_gross_margin)
        self.assertEqual(Decimal(str(summary.data["collected_today"])), expected_collected_today)
        self.assertEqual(Decimal(str(summary.data["collected_month"])), expected_collected_today)
        self.assertEqual(Decimal(str(summary.data["credit_collected_total"])), Decimal("8.00"))
        self.assertEqual(Decimal(str(summary.data["credit_recovered_month"])), Decimal("8.00"))
        self.assertEqual(Decimal(str(summary.data["outstanding_credit"])), credit_sale.balance_due)
        self.assertEqual(Decimal(str(summary.data["overdue_credit"])), credit_sale.balance_due)
        self.assertEqual(Decimal(str(summary.data["credit_issued_month"])), expected_credit_issued)
        self.assertEqual(Decimal(str(summary.data["expenses_today"])), expected_expenses_month)
        self.assertEqual(Decimal(str(summary.data["expenses_month"])), expected_expenses_month)
        self.assertEqual(Decimal(str(summary.data["net_position"])), expected_net_position)
