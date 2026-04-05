from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory, StockMovement
from logistics.models import Route
from sales.models import Sale, SaleItem, SalePayment, CustomerOrder
from sales.services import compute_totals, money


class SmokeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.business = Business.objects.create(
            business_name="Test Biz",
            email="biz@example.com",
            phone="0700000000",
            kra_pin="P123456",
        )
        self.branch = Branch.objects.create(
            business=self.business,
            branch_name="Main Branch",
            location="HQ",
        )
        self.route = Route.objects.create(
            name="Route A",
            code="R-A",
            branch=self.branch,
        )
        self.category = Category.objects.create(name="Beverages")
        self.product = Product.objects.create(
            name="Tea",
            category=self.category,
            sku="SKU-TEA",
            cost_price="50.00",
            selling_price="100.00",
            retail_price="100.00",
            wholesale_price="90.00",
            wholesale_threshold=10,
        )
        self.unit = ProductUnit.objects.create(
            product=self.product,
            unit_name="Piece",
            unit_code="pc",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="100.00",
            wholesale_price="90.00",
            wholesale_threshold=10,
        )
        self.inventory = Inventory.objects.create(
            branch=self.branch,
            product=self.product,
            quantity=20,
        )
        self.customer = Customer.objects.create(
            name="Acme Ltd",
            route=self.route,
            is_wholesale_customer=True,
        )

        self.admin = User.objects.create_user(
            "admin1",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )
        self.supervisor = User.objects.create_user(
            "super1",
            email="super@example.com",
            password="password123",
            first_name="Super",
            last_name="Visor",
            role="supervisor",
        )
        self.cashier = User.objects.create_user(
            "cash1",
            email="cashier@example.com",
            password="password123",
            first_name="Cash",
            last_name="Ier",
            role="cashier",
        )

    def api_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def _create_sale_with_payment(self):
        totals = compute_totals(money("100.00"), money("0.00"), money("0.00"))
        sale = Sale.objects.create(
            branch=self.branch,
            customer=self.customer,
            sale_type="retail",
            total_amount=totals["subtotal"],
            discount=money("0.00"),
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            amount_paid=money("0.00"),
            balance=totals["balance"],
            balance_due=totals["balance"],
            status="completed",
            payment_status="paid",
        )
        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            product_unit=self.unit,
            quantity=1,
            unit_price="100.00",
            total_price="100.00",
            cost_price_snapshot="50.00",
            total_cost_snapshot="50.00",
            gross_profit_snapshot="50.00",
            conversion_snapshot=1,
            base_quantity=1,
            price_type_used="retail",
            pricing_reason="retail_default",
        )
        payment = SalePayment.objects.create(
            sale=sale,
            customer=self.customer,
            amount="100.00",
            method="mpesa",
            status="completed",
            reference="ABC123XYZ",
            phone_number="254700000000",
            received_by=self.admin,
        )
        return sale, payment

    def test_auth_login_and_protected_backoffice(self):
        res = self.client.post(
            "/api/auth/token/",
            {"username": self.admin.username, "password": "password123"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)

        res_bad = self.client.post(
            "/api/auth/token/",
            {"username": self.admin.username, "password": "wrongpass"},
            format="json",
        )
        self.assertEqual(res_bad.status_code, 400)

        res_anon = self.client.get("/api/sales/backoffice/sales/")
        self.assertIn(res_anon.status_code, (401, 403))

        cashier_client = self.api_for(self.cashier)
        res_cashier = cashier_client.get("/api/sales/backoffice/sales/")
        self.assertEqual(res_cashier.status_code, 403)

        admin_client = self.api_for(self.admin)
        res_admin = admin_client.get("/api/sales/backoffice/sales/")
        self.assertEqual(res_admin.status_code, 200)

    def test_products_backoffice_crud_permissions(self):
        admin_client = self.api_for(self.admin)
        payload = {
            "sku": "SKU-COFFEE",
            "name": "Coffee",
            "category": "Beverages",
            "cost_price": "40.00",
            "selling_price": "80.00",
            "retail_price": "80.00",
            "wholesale_price": "70.00",
            "wholesale_threshold": 10,
            "stock_quantity": 5,
            "branch": str(self.branch.id),
        }
        res = admin_client.post("/api/inventory/products/create/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        product_id = res.data["id"]

        res_update = admin_client.put(
            f"/api/inventory/products/{product_id}/",
            {**payload, "name": "Coffee Updated"},
            format="json",
        )
        self.assertEqual(res_update.status_code, 200)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.post("/api/inventory/products/create/", payload, format="json")
        self.assertEqual(res_forbidden.status_code, 403)

    def test_customers_backoffice_crud(self):
        admin_client = self.api_for(self.admin)
        res = admin_client.post(
            "/api/customers/create/",
            {
                "name": "Beta LLC",
                "route_id": str(self.route.id),
                "is_wholesale_customer": True,
                "can_view_balance": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        customer_id = res.data["id"]

        res_update = admin_client.put(
            f"/api/customers/{customer_id}/",
            {
                "name": "Beta LLC Updated",
                "route_id": str(self.route.id),
                "is_wholesale_customer": False,
                "can_view_balance": False,
            },
            format="json",
        )
        self.assertEqual(res_update.status_code, 200)

        list_res = admin_client.get("/api/customers/")
        self.assertEqual(list_res.status_code, 200)
        first = (list_res.data.get("results") or list_res.data)[0]
        self.assertIn("route_name", first)
        self.assertIn("branch_name", first)

    def test_staff_users_backoffice_crud_permissions(self):
        admin_client = self.api_for(self.admin)
        res = admin_client.post(
            "/api/accounts/users/create/",
            {
                "username": "newstaff",
                "first_name": "New",
                "last_name": "Staff",
                "email": "newstaff@example.com",
                "role": "cashier",
                "password": "password123",
                "branch": str(self.branch.id),
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        user_id = res.data["id"]

        res_update = admin_client.put(
            f"/api/accounts/users/{user_id}/",
            {
                "username": "newstaff",
                "first_name": "New",
                "last_name": "Staff",
                "email": "newstaff@example.com",
                "role": "salesperson",
                "branch": str(self.branch.id),
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res_update.status_code, 200)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.get("/api/accounts/users/")
        self.assertEqual(res_forbidden.status_code, 403)

    def test_setup_branches_routes_categories_permissions(self):
        admin_client = self.api_for(self.admin)
        res_branch = admin_client.post(
            "/api/business/branches/create/",
            {
                "name": "Branch 2",
                "location": "City",
                "business_id": str(self.business.id),
            },
            format="json",
        )
        self.assertEqual(res_branch.status_code, 201)

        res_route = admin_client.post(
            "/api/routes/create/",
            {
                "name": "Route B",
                "code": "R-B",
                "branch": str(self.branch.id),
            },
            format="json",
        )
        self.assertEqual(res_route.status_code, 201)

        res_cat = admin_client.post(
            "/api/inventory/categories/create/",
            {"name": "Snacks"},
            format="json",
        )
        self.assertEqual(res_cat.status_code, 201)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.post(
            "/api/inventory/categories/create/",
            {"name": "Blocked"},
            format="json",
        )
        self.assertEqual(res_forbidden.status_code, 403)

    def test_inventory_adjustments(self):
        admin_client = self.api_for(self.admin)
        res = admin_client.post(
            "/api/inventory/adjustments/create/",
            {
                "product": str(self.product.id),
                "branch": str(self.branch.id),
                "adjustment_type": "increase",
                "quantity": 5,
                "reason": "Stock count",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 25)
        self.assertTrue(
            StockMovement.objects.filter(product=self.product, branch=self.branch, movement_type="adjustment").exists()
        )

        res_decrease = admin_client.post(
            "/api/inventory/adjustments/create/",
            {
                "product": str(self.product.id),
                "branch": str(self.branch.id),
                "adjustment_type": "decrease",
                "quantity": 999,
                "reason": "Overcount",
            },
            format="json",
        )
        self.assertEqual(res_decrease.status_code, 400)

    def test_sales_orders_payments_backoffice_visibility(self):
        sale, payment = self._create_sale_with_payment()
        CustomerOrder.objects.create(sale=sale, status="pending")

        admin_client = self.api_for(self.admin)
        res_sales = admin_client.get("/api/sales/backoffice/sales/")
        self.assertEqual(res_sales.status_code, 200)

        res_sale_detail = admin_client.get(f"/api/sales/backoffice/sales/{sale.id}/")
        self.assertEqual(res_sale_detail.status_code, 200)
        self.assertTrue(len(res_sale_detail.data.get("payments", [])) >= 1)

        res_orders = admin_client.get("/api/sales/backoffice/orders/")
        self.assertEqual(res_orders.status_code, 200)

        order_id = (res_orders.data.get("results") or res_orders.data)[0]["id"]
        res_order_detail = admin_client.get(f"/api/sales/backoffice/orders/{order_id}/")
        self.assertEqual(res_order_detail.status_code, 200)

        res_payments = admin_client.get("/api/payments/backoffice/")
        self.assertEqual(res_payments.status_code, 200)
        payment_id = (res_payments.data.get("results") or res_payments.data)[0]["id"]
        res_payment_detail = admin_client.get(f"/api/payments/backoffice/{payment_id}/")
        self.assertEqual(res_payment_detail.status_code, 200)
        self.assertIn("sale", res_payment_detail.data)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.get("/api/sales/backoffice/orders/")
        self.assertEqual(res_forbidden.status_code, 403)

    def test_tax_inclusive_totals_formula(self):
        totals = compute_totals(money("116.00"), money("0.00"), money("0.00"))
        self.assertEqual(totals["grand_total"], Decimal("116.00"))
        self.assertEqual(totals["tax"], Decimal("16.00"))
        totals_discount = compute_totals(money("100.00"), money("10.00"), money("0.00"))
        self.assertEqual(totals_discount["grand_total"], Decimal("90.00"))
        expected_tax = money(Decimal("90.00") * Decimal("0.16") / Decimal("1.16"))
        self.assertEqual(totals_discount["tax"], expected_tax)

    def test_sales_export_csv_and_filters(self):
        totals = compute_totals(money("100.00"), money("0.00"), money("0.00"))
        sale_main = Sale.objects.create(
            branch=self.branch,
            customer=self.customer,
            sale_type="retail",
            total_amount=totals["subtotal"],
            discount=money("0.00"),
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            amount_paid=money("0.00"),
            balance=totals["balance"],
            balance_due=totals["balance"],
            status="completed",
            payment_status="paid",
        )
        other_branch = Branch.objects.create(
            business=self.business,
            branch_name="Secondary",
            location="Alt",
        )
        other_customer = Customer.objects.create(name="Other", route=self.route)
        Sale.objects.create(
            branch=other_branch,
            customer=other_customer,
            sale_type="retail",
            total_amount=totals["subtotal"],
            discount=money("0.00"),
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            amount_paid=money("0.00"),
            balance=totals["balance"],
            balance_due=totals["balance"],
            status="completed",
            payment_status="paid",
        )

        admin_client = self.api_for(self.admin)
        res = admin_client.get(f"/api/sales/backoffice/sales/export/?branch={self.branch.id}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        body = res.content.decode("utf-8")
        self.assertIn("sale_id,customer,branch,status,total,paid,balance,payment_mode,payment_status,created_at", body)
        self.assertIn(str(sale_main.id), body)
        self.assertNotIn(str(other_branch.id), body)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.get("/api/sales/backoffice/sales/export/")
        self.assertEqual(res_forbidden.status_code, 403)

    def test_orders_export_csv_and_filters(self):
        totals = compute_totals(money("100.00"), money("0.00"), money("0.00"))
        sale_main = Sale.objects.create(
            branch=self.branch,
            customer=self.customer,
            sale_type="wholesale",
            total_amount=totals["subtotal"],
            discount=money("0.00"),
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            amount_paid=money("0.00"),
            balance=totals["balance"],
            balance_due=totals["balance"],
            status="draft",
            payment_status="unpaid",
        )
        order_main = CustomerOrder.objects.create(sale=sale_main, status="pending")

        other_branch = Branch.objects.create(
            business=self.business,
            branch_name="Branch X",
            location="X",
        )
        other_customer = Customer.objects.create(name="Other B", route=self.route)
        other_sale = Sale.objects.create(
            branch=other_branch,
            customer=other_customer,
            sale_type="wholesale",
            total_amount=totals["subtotal"],
            discount=money("0.00"),
            tax=totals["tax"],
            grand_total=totals["grand_total"],
            amount_paid=money("0.00"),
            balance=totals["balance"],
            balance_due=totals["balance"],
            status="draft",
            payment_status="unpaid",
        )
        CustomerOrder.objects.create(sale=other_sale, status="pending")

        admin_client = self.api_for(self.admin)
        res = admin_client.get(f"/api/sales/backoffice/orders/export/?branch={self.branch.id}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        body = res.content.decode("utf-8")
        self.assertIn("order_id,customer,branch,route,status,total,assigned,created_at", body)
        self.assertIn(str(order_main.id), body)
        self.assertNotIn(str(other_branch.id), body)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.get("/api/sales/backoffice/orders/export/")
        self.assertEqual(res_forbidden.status_code, 403)

    def test_payments_export_csv_and_filters(self):
        sale, payment = self._create_sale_with_payment()
        SalePayment.objects.create(
            sale=sale,
            customer=self.customer,
            amount="50.00",
            method="cash",
            status="completed",
            reference="CASH001",
            phone_number="",
            received_by=self.admin,
        )

        admin_client = self.api_for(self.admin)
        res = admin_client.get("/api/payments/backoffice/export/?method=mpesa")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        body = res.content.decode("utf-8")
        self.assertIn("payment_id,sale_id,customer,branch,amount,method,status,reference,phone,payment_date,received_by", body)
        self.assertIn(payment.reference, body)
        self.assertNotIn("CASH001", body)

        cashier_client = self.api_for(self.cashier)
        res_forbidden = cashier_client.get("/api/payments/backoffice/export/")
        self.assertEqual(res_forbidden.status_code, 403)
