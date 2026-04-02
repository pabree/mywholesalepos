from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory
from sales.models import Sale, CustomerOrder
from logistics.models import Route


class PerformanceReportTests(TestCase):
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
        self.route = Route.objects.create(name="CBD Route", branch=self.branch)
        self.customer.route = self.route
        self.customer.save(update_fields=["route"])
        self.wholesale_customer.route = self.route
        self.wholesale_customer.save(update_fields=["route"])
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
        self.cashier.branch = self.branch
        self.cashier.save(update_fields=["branch"])
        self.salesperson = User.objects.create_user(
            "sales1",
            email="sales@example.com",
            password="password123",
            first_name="Sales",
            last_name="Person",
            role="salesperson",
        )
        self.salesperson.branch = self.branch
        self.salesperson.save(update_fields=["branch"])
        self.delivery = User.objects.create_user(
            "deliver1",
            email="deliver@example.com",
            password="password123",
            first_name="Delivery",
            last_name="Person",
            role="deliver_person",
        )
        self.delivery.branch = self.branch
        self.delivery.save(update_fields=["branch"])
        self.admin = User.objects.create_user(
            "admin1",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )

    def _sale_payload(self, *, qty=1, credit=False, assigned_to=None):
        payload = {
            "branch": str(self.branch.id),
            "customer": str(self.customer.id),
            "sale_type": "retail",
            "discount": "0.00",
            "amount_paid": "0.00",
            "items": [
                {"product": str(self.product.id), "product_unit": str(self.base_unit.id), "quantity": qty},
            ],
        }
        if assigned_to:
            payload["assigned_to"] = str(assigned_to.id)
        if credit:
            payload["sale_type"] = "wholesale"
            payload["customer"] = str(self.wholesale_customer.id)
            payload["is_credit_sale"] = True
            payload["assigned_to"] = str(assigned_to.id)
            payload["payment_mode"] = "credit"
        return payload

    def _complete_sale(self, client, sale_id, amount_paid):
        return client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(amount_paid)},
            format="json",
        )

    def test_cashier_performance(self):
        client = APIClient()
        client.force_authenticate(user=self.cashier)
        res = client.post("/api/sales/", self._sale_payload(qty=1), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(client, sale_id, sale.grand_total)

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        perf = admin_client.get("/api/finance/performance/cashiers/")
        self.assertEqual(perf.status_code, 200)
        results = perf.data["results"]
        self.assertTrue(results)
        cashier_row = next(row for row in results if row["user_id"] == str(self.cashier.id))
        self.assertEqual(cashier_row["sales_count_processed"], 1)
        self.assertEqual(Decimal(str(cashier_row["sales_total_processed"])), sale.grand_total)

    def test_salesperson_performance_credit(self):
        sales_client = APIClient()
        sales_client.force_authenticate(user=self.salesperson)
        res = sales_client.post(
            "/api/sales/",
            self._sale_payload(qty=1, credit=True, assigned_to=self.salesperson),
            format="json",
        )
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(sales_client, sale_id, Decimal("5.00"))
        sales_client.post(
            f"/api/sales/{sale_id}/payments/",
            {"amount": "3.00", "payment_method": "cash"},
            format="json",
        )

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        perf = admin_client.get("/api/finance/performance/salespeople/")
        self.assertEqual(perf.status_code, 200)
        results = perf.data["results"]
        row = next(item for item in results if item["user_id"] == str(self.salesperson.id))
        expected_gross_profit = sale.grand_total - Decimal("10.00")
        self.assertEqual(Decimal(str(row["sales_total_assigned"])), sale.grand_total)
        self.assertEqual(Decimal(str(row["gross_profit_generated"])), expected_gross_profit)
        self.assertEqual(Decimal(str(row["credit_issued"])), sale.grand_total - Decimal("5.00"))
        self.assertEqual(Decimal(str(row["credit_recovered"])), Decimal("3.00"))

    def test_delivery_performance(self):
        client = APIClient()
        client.force_authenticate(user=self.cashier)
        res = client.post(
            "/api/sales/",
            self._sale_payload(qty=1, assigned_to=self.delivery),
            format="json",
        )
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(client, sale_id, sale.grand_total)

        CustomerOrder.objects.create(sale=sale, status="delivered")

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        perf = admin_client.get("/api/finance/performance/delivery/")
        self.assertEqual(perf.status_code, 200)
        results = perf.data["results"]
        row = next(item for item in results if item["user_id"] == str(self.delivery.id))
        self.assertEqual(row["assigned_orders_count"], 1)
        self.assertEqual(row["delivered_orders_count"], 1)
        self.assertEqual(Decimal(str(row["assigned_sales_total"])), sale.grand_total)

    def test_performance_admin_only(self):
        client = APIClient()
        client.force_authenticate(user=self.cashier)
        res = client.get("/api/finance/performance/cashiers/")
        self.assertEqual(res.status_code, 403)
        res_routes = client.get("/api/finance/performance/routes/")
        self.assertEqual(res_routes.status_code, 403)

    def test_performance_export_csv(self):
        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        res = admin_client.get("/api/finance/performance/cashiers/export/?format=csv")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        res_routes = admin_client.get("/api/finance/performance/routes/export/?format=csv")
        self.assertEqual(res_routes.status_code, 200)
        self.assertIn("text/csv", res_routes["Content-Type"])

    def test_performance_user_list_filters(self):
        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        res = admin_client.get(f"/api/finance/performance/users/?role=cashier&branch={self.branch.id}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(u["id"] == str(self.cashier.id) for u in res.data))
        self.assertFalse(any(u["id"] == str(self.salesperson.id) for u in res.data))

    def test_route_performance_snapshot(self):
        client = APIClient()
        client.force_authenticate(user=self.cashier)
        res = client.post("/api/sales/", self._sale_payload(qty=1), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(client, sale_id, sale.grand_total)

        other_route = Route.objects.create(name="East Route", branch=self.branch)
        self.customer.route = other_route
        self.customer.save(update_fields=["route"])

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        perf = admin_client.get("/api/finance/performance/routes/")
        self.assertEqual(perf.status_code, 200)
        results = perf.data["results"]
        route_row = next(row for row in results if row["route_id"] == str(self.route.id))
        self.assertEqual(Decimal(str(route_row["sales_total"])), sale.grand_total)
        self.assertEqual(route_row["sales_count"], 1)
        self.assertEqual(Decimal(str(route_row["collections_total"])), sale.grand_total)

    def test_route_outstanding_and_overdue_credit(self):
        client = APIClient()
        client.force_authenticate(user=self.salesperson)
        res = client.post(
            "/api/sales/",
            self._sale_payload(qty=1, credit=True, assigned_to=self.salesperson),
            format="json",
        )
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self._complete_sale(client, sale_id, Decimal("0.00"))
        sale.refresh_from_db()
        sale.due_date = sale.completed_at.date()  # set due today then make overdue
        sale.save(update_fields=["due_date"])
        sale.due_date = sale.due_date - timedelta(days=1)
        sale.save(update_fields=["due_date"])

        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        perf = admin_client.get("/api/finance/performance/routes/")
        self.assertEqual(perf.status_code, 200)
        results = perf.data["results"]
        route_row = next(row for row in results if row["route_id"] == str(self.route.id))
        self.assertEqual(Decimal(str(route_row["outstanding_credit"])), sale.balance_due)
        self.assertEqual(Decimal(str(route_row["overdue_credit"])), sale.balance_due)
