from django.test import TestCase
from datetime import timedelta
from django.db import IntegrityError
from unittest.mock import patch
from rest_framework.test import APIClient

from accounts.models import User
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory, StockMovement
from sales.models import Sale


class SaleLifecycleTests(TestCase):
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
        self.user = User.objects.create_user(
            "cashier1",
            email="cashier@example.com",
            password="password123",
            first_name="Cashier",
            last_name="One",
            role="cashier",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _payload(self, qty=2, sale_type="retail"):
        return {
            "branch": str(self.branch.id),
            "customer": str(self.customer.id),
            "sale_type": sale_type,
            "discount": "0.00",
            "amount_paid": "0.00",
            "items": [
                {"product": str(self.product.id), "product_unit": str(self.base_unit.id), "quantity": qty},
            ],
        }

    def test_create_retail_draft_sale(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        self.assertEqual(sale.status, "draft")
        self.assertEqual(sale.sale_type, "retail")

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)

    def test_hold_and_resume_sale(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]

        hold = self.client.post(f"/api/sales/{sale_id}/hold/")
        self.assertEqual(hold.status_code, 200)
        sale = Sale.objects.get(id=sale_id)
        self.assertEqual(sale.status, "held")

        resume = self.client.post(f"/api/sales/{sale_id}/resume/")
        self.assertEqual(resume.status_code, 200)
        sale.refresh_from_db()
        self.assertEqual(sale.status, "draft")

        # Update and complete
        update = self.client.patch(
            f"/api/sales/{sale_id}/",
            {"items": [{"product": str(self.product.id), "product_unit": str(self.base_unit.id), "quantity": 3}]},
            format="json",
        )
        self.assertEqual(update.status_code, 200)

        sale = Sale.objects.get(id=sale_id)
        complete = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )
        self.assertEqual(complete.status_code, 200)
        sale.refresh_from_db()
        self.assertEqual(sale.status, "completed")

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 7)

    def test_held_list_only_includes_held_sales(self):
        res1 = self.client.post("/api/sales/", self._payload(), format="json")
        sale1_id = res1.data["id"]
        res2 = self.client.post("/api/sales/", self._payload(), format="json")
        sale2_id = res2.data["id"]

        self.client.post(f"/api/sales/{sale1_id}/hold/")

        held = self.client.get("/api/sales/held/")
        self.assertEqual(held.status_code, 200)
        self.assertIn("results", held.data)
        held_ids = {s["id"] for s in held.data["results"]}
        self.assertIn(str(sale1_id), held_ids)
        self.assertNotIn(str(sale2_id), held_ids)

        resume = self.client.post(f"/api/sales/{sale1_id}/resume/")
        self.assertEqual(resume.status_code, 200)

        held_after = self.client.get("/api/sales/held/")
        self.assertEqual(held_after.status_code, 200)
        held_after_ids = {s["id"] for s in held_after.data["results"]}
        self.assertNotIn(str(sale1_id), held_after_ids)

    def test_stock_not_changed_when_held(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]
        self.client.post(f"/api/sales/{sale_id}/hold/")

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)

    def test_prevent_invalid_transition(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )
        hold = self.client.post(f"/api/sales/{sale_id}/hold/")
        self.assertEqual(hold.status_code, 400)

    def test_wholesale_sale_type(self):
        res = self.client.post("/api/sales/", self._payload(sale_type="wholesale"), format="json")
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        self.assertEqual(sale.sale_type, "wholesale")

    def test_non_credit_requires_full_payment(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]
        complete = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": "0.00"},
            format="json",
        )
        self.assertEqual(complete.status_code, 400)

    def test_overpayment_allowed(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        complete = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total + 10)},
            format="json",
        )
        self.assertEqual(complete.status_code, 200)
        sale.refresh_from_db()
        self.assertEqual(sale.status, "completed")
        self.assertEqual(sale.balance_due, 0)

    def test_rollback_on_stock_movement_failure(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]

        with patch("sales.models.StockMovement.objects.create", side_effect=IntegrityError("boom")):
            sale = Sale.objects.get(id=sale_id)
            complete = self.client.post(
                f"/api/sales/{sale_id}/complete/",
                {"amount_paid": str(sale.grand_total)},
                format="json",
            )
            self.assertEqual(complete.status_code, 400)

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)
        sale = Sale.objects.get(id=sale_id)
        self.assertNotEqual(sale.status, "completed")
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_double_complete_does_not_double_deduct(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]

        sale = Sale.objects.get(id=sale_id)
        first = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )
        self.assertEqual(second.status_code, 400)

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 8)
        self.assertEqual(StockMovement.objects.filter(sale_id=sale_id).count(), 1)

    def test_update_invalid_items_does_not_delete_existing(self):
        res = self.client.post("/api/sales/", self._payload(), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        self.assertEqual(sale.items.count(), 1)

        invalid = self.client.put(
            f"/api/sales/{sale_id}/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        sale.refresh_from_db()
        self.assertEqual(sale.items.count(), 1)

    def test_reprice_on_customer_change_without_items(self):
        res = self.client.post("/api/sales/", self._payload(qty=2), format="json")
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "20.00")

        update = self.client.patch(
            f"/api/sales/{sale_id}/",
            {"customer": str(self.wholesale_customer.id)},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        sale.refresh_from_db()
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "15.00")


class PricingRulesTests(TestCase):
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
        self.customer = Customer.objects.create(name="Retail Customer", is_wholesale_customer=False)
        self.wholesale_customer = Customer.objects.create(name="Wholesale Customer", is_wholesale_customer=True)
        self.category = Category.objects.create(name="Beverages")
        self.product_a = Product.objects.create(
            name="Cola",
            sku="COLA-001",
            category=self.category,
            cost_price="10.00",
            selling_price="20.00",
            retail_price="20.00",
            wholesale_price="15.00",
            wholesale_threshold=10,
        )
        self.product_b = Product.objects.create(
            name="Juice",
            sku="JUI-001",
            category=self.category,
            cost_price="12.00",
            selling_price="22.00",
            retail_price="22.00",
            wholesale_price="18.00",
            wholesale_threshold=3,
        )
        self.unit_a_piece = ProductUnit.objects.create(
            product=self.product_a,
            unit_name="Piece",
            unit_code="piece",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="20.00",
            wholesale_price="15.00",
            wholesale_threshold=10,
        )
        self.unit_a_carton = ProductUnit.objects.create(
            product=self.product_a,
            unit_name="Carton",
            unit_code="carton",
            conversion_to_base_unit=12,
            is_base_unit=False,
            retail_price="220.00",
            wholesale_price="180.00",
            wholesale_threshold=2,
        )
        self.unit_b_piece = ProductUnit.objects.create(
            product=self.product_b,
            unit_name="Piece",
            unit_code="piece",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="22.00",
            wholesale_price="18.00",
            wholesale_threshold=3,
        )
        Inventory.objects.create(branch=self.branch, product=self.product_a, quantity=100, reorder_level=5)
        Inventory.objects.create(branch=self.branch, product=self.product_b, quantity=100, reorder_level=5)

        self.user = User.objects.create_user(
            "cashier2",
            email="cashier2@example.com",
            password="password123",
            first_name="Cashier",
            last_name="Two",
            role="cashier",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_retail_customer_below_threshold_uses_retail_price(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "20.00")
        self.assertEqual(item.price_type_used, "retail")

    def test_retail_customer_at_threshold_uses_wholesale_price(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 10}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "15.00")
        self.assertEqual(item.price_type_used, "wholesale")

    def test_wholesale_customer_below_threshold_uses_wholesale_price(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.wholesale_customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "15.00")
        self.assertEqual(item.price_type_used, "wholesale")

    def test_mixed_items_priced_independently(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [
                    {"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2},
                    {"product": str(self.product_b.id), "product_unit": str(self.unit_b_piece.id), "quantity": 3},
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        items = {i.product_id: i for i in sale.items.all()}
        self.assertEqual(str(items[self.product_a.id].unit_price), "20.00")
        self.assertEqual(str(items[self.product_b.id].unit_price), "18.00")

    def test_sale_totals_computed_server_side(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2}],
                "total_amount": "1.00",
                "grand_total": "1.00",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        self.assertEqual(str(sale.total_amount), "40.00")

    def test_client_supplied_unit_price_ignored(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [
                    {"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2, "unit_price": "1.00"}
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "20.00")

    def test_price_snapshot_persists_after_product_price_change(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()

        self.product_a.retail_price = "30.00"
        self.product_a.save()

        item.refresh_from_db()
        self.assertEqual(str(item.unit_price), "20.00")

    def test_missing_wholesale_price_when_triggered_fails(self):
        product = Product.objects.create(
            name="Bulk Rice",
            sku="RICE-001",
            category=self.category,
            cost_price="50.00",
            selling_price="80.00",
            retail_price="80.00",
            wholesale_price=None,
            wholesale_threshold=2,
        )
        unit = ProductUnit.objects.create(
            product=product,
            unit_name="Bag",
            unit_code="bag",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="80.00",
            wholesale_price=None,
            wholesale_threshold=2,
        )
        Inventory.objects.create(branch=self.branch, product=product, quantity=50, reorder_level=5)

        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(product.id), "product_unit": str(unit.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_wholesale_sale_type_forces_wholesale_price(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "wholesale",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "15.00")
        self.assertEqual(item.price_type_used, "wholesale")

    def test_switching_sale_type_reprices_existing_items(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "retail",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 2}],
            },
            format="json",
        )
        sale_id = res.data["id"]
        sale = Sale.objects.get(id=sale_id)
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "20.00")

        update = self.client.patch(
            f"/api/sales/{sale_id}/",
            {"sale_type": "wholesale"},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        sale.refresh_from_db()
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "15.00")

    def test_new_line_added_to_wholesale_sale_priced_wholesale(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "wholesale",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 1}],
            },
            format="json",
        )
        sale_id = res.data["id"]

        update = self.client.put(
            f"/api/sales/{sale_id}/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "sale_type": "wholesale",
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [
                    {"product": str(self.product_a.id), "product_unit": str(self.unit_a_piece.id), "quantity": 1},
                    {"product": str(self.product_b.id), "product_unit": str(self.unit_b_piece.id), "quantity": 1},
                ],
            },
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        sale = Sale.objects.get(id=sale_id)
        items = {i.product_id: i for i in sale.items.all()}
        self.assertEqual(str(items[self.product_b.id].unit_price), "18.00")


class MultiUnitTests(TestCase):
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
        self.customer = Customer.objects.create(name="Retail Customer", is_wholesale_customer=False)
        self.category = Category.objects.create(name="Staples")
        self.product = Product.objects.create(
            name="Soap",
            sku="SOAP-001",
            category=self.category,
            cost_price="5.00",
            selling_price="10.00",
            retail_price="10.00",
            wholesale_price="8.00",
            wholesale_threshold=10,
        )
        self.unit_piece = ProductUnit.objects.create(
            product=self.product,
            unit_name="Piece",
            unit_code="piece",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="10.00",
            wholesale_price="8.00",
            wholesale_threshold=10,
        )
        self.unit_carton = ProductUnit.objects.create(
            product=self.product,
            unit_name="Carton",
            unit_code="carton",
            conversion_to_base_unit=12,
            is_base_unit=False,
            retail_price="100.00",
            wholesale_price="90.00",
            wholesale_threshold=2,
        )
        Inventory.objects.create(branch=self.branch, product=self.product, quantity=120, reorder_level=10)

        self.user = User.objects.create_user(
            "cashier3",
            email="cashier3@example.com",
            password="password123",
            first_name="Cashier",
            last_name="Three",
            role="cashier",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_carton_sale_deducts_base_units(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product.id), "product_unit": str(self.unit_carton.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale_id = res.data["id"]

        sale = Sale.objects.get(id=sale_id)
        complete = self.client.post(
            f"/api/sales/{sale_id}/complete/",
            {"amount_paid": str(sale.grand_total)},
            format="json",
        )
        self.assertEqual(complete.status_code, 200)

        inventory = Inventory.objects.get(product=self.product, branch=self.branch)
        self.assertEqual(inventory.quantity, 96)

        sale = Sale.objects.get(id=sale_id)
        item = sale.items.first()
        self.assertEqual(item.conversion_snapshot, 12)
        self.assertEqual(item.base_quantity, 24)

    def test_unit_pricing_threshold_applies_per_unit(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product.id), "product_unit": str(self.unit_carton.id), "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale = Sale.objects.get(id=res.data["id"])
        item = sale.items.first()
        self.assertEqual(str(item.unit_price), "90.00")
        self.assertEqual(item.price_type_used, "wholesale")

    def test_invalid_unit_product_combination_rejected(self):
        other_product = Product.objects.create(
            name="Detergent",
            sku="DET-001",
            category=self.category,
            cost_price="8.00",
            selling_price="14.00",
            retail_price="14.00",
            wholesale_price="12.00",
            wholesale_threshold=5,
        )
        other_unit = ProductUnit.objects.create(
            product=other_product,
            unit_name="Piece",
            unit_code="piece",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="14.00",
            wholesale_price="12.00",
            wholesale_threshold=5,
        )
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product.id), "product_unit": str(other_unit.id), "quantity": 1}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_hold_preserves_selected_unit(self):
        res = self.client.post(
            "/api/sales/",
            {
                "branch": str(self.branch.id),
                "customer": str(self.customer.id),
                "discount": "0.00",
                "amount_paid": "0.00",
                "items": [{"product": str(self.product.id), "product_unit": str(self.unit_carton.id), "quantity": 1}],
            },
            format="json",
        )
        sale_id = res.data["id"]
        hold = self.client.post(f"/api/sales/{sale_id}/hold/")
        self.assertEqual(hold.status_code, 200)

        detail = self.client.get(f"/api/sales/{sale_id}/")
        self.assertEqual(detail.status_code, 200)
        item = detail.data["items"][0]
        self.assertEqual(item["product_unit"], str(self.unit_carton.id))


class CreditSaleTests(TestCase):
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
        self.customer = Customer.objects.create(name="Wholesale Customer", is_wholesale_customer=True)
        self.category = Category.objects.create(name="Bulk")
        self.product = Product.objects.create(
            name="Flour",
            sku="FLR-001",
            category=self.category,
            cost_price="50.00",
            selling_price="80.00",
            retail_price="80.00",
            wholesale_price="70.00",
            wholesale_threshold=5,
        )
        self.unit = ProductUnit.objects.create(
            product=self.product,
            unit_name="Bag",
            unit_code="bag",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="80.00",
            wholesale_price="70.00",
            wholesale_threshold=5,
        )
        Inventory.objects.create(branch=self.branch, product=self.product, quantity=100, reorder_level=5)

        self.cashier = User.objects.create_user(
            "cashier_credit",
            email="cashier_credit@example.com",
            password="password123",
            first_name="Cashier",
            last_name="Credit",
            role="cashier",
        )
        self.delivery = User.objects.create_user(
            "deliver_credit",
            email="deliver_credit@example.com",
            password="password123",
            first_name="Delivery",
            last_name="Person",
            role="deliver_person",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.cashier)

    def _credit_payload(self, amount_paid="0.00", assigned_to=None, due_date=None):
        payload = {
            "branch": str(self.branch.id),
            "customer": str(self.customer.id),
            "sale_type": "wholesale",
            "is_credit_sale": True,
            "assigned_to": str(assigned_to) if assigned_to else None,
            "discount": "0.00",
            "amount_paid": amount_paid,
            "items": [{"product": str(self.product.id), "product_unit": str(self.unit.id), "quantity": 5}],
        }
        if due_date:
            payload["due_date"] = due_date
        return payload

    def test_credit_sale_requires_assigned_user(self):
        res = self.client.post("/api/sales/", self._credit_payload(assigned_to=None), format="json")
        self.assertEqual(res.status_code, 400)

    def test_credit_sale_requires_delivery_or_salesperson(self):
        res = self.client.post(
            "/api/sales/",
            self._credit_payload(assigned_to=self.cashier.id),
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_due_date_defaults_to_three_days_after_completion(self):
        res = self.client.post(
            "/api/sales/",
            self._credit_payload(assigned_to=self.delivery.id),
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sale_id = res.data["id"]

        complete = self.client.post(f"/api/sales/{sale_id}/complete/", {"amount_paid": "0.00"}, format="json")
        self.assertEqual(complete.status_code, 200)
        sale = Sale.objects.get(id=sale_id)
        self.assertIsNotNone(sale.completed_at)
        self.assertEqual(sale.due_date, sale.completed_at.date() + timedelta(days=3))

    def test_partial_payment_updates_balance_and_status(self):
        res = self.client.post(
            "/api/sales/",
            self._credit_payload(assigned_to=self.delivery.id),
            format="json",
        )
        sale_id = res.data["id"]
        self.client.post(f"/api/sales/{sale_id}/complete/", {"amount_paid": "0.00"}, format="json")

        payment = self.client.post(
            f"/api/sales/{sale_id}/payments/",
            {"amount": "100.00", "payment_method": "cash"},
            format="json",
        )
        self.assertEqual(payment.status_code, 201)
        sale = Sale.objects.get(id=sale_id)
        self.assertTrue(sale.balance_due > 0)
        self.assertEqual(sale.payment_status, "partial")

    def test_full_payment_marks_paid(self):
        res = self.client.post(
            "/api/sales/",
            self._credit_payload(assigned_to=self.delivery.id),
            format="json",
        )
        sale_id = res.data["id"]
        self.client.post(f"/api/sales/{sale_id}/complete/", {"amount_paid": "0.00"}, format="json")
        sale = Sale.objects.get(id=sale_id)

        self.client.post(
            f"/api/sales/{sale_id}/payments/",
            {"amount": str(sale.grand_total), "payment_method": "cash"},
            format="json",
        )
        sale.refresh_from_db()
        self.assertEqual(sale.payment_status, "paid")
        self.assertEqual(sale.balance_due, 0)

    def test_overdue_status_computed(self):
        res = self.client.post(
            "/api/sales/",
            self._credit_payload(assigned_to=self.delivery.id, due_date="2020-01-01"),
            format="json",
        )
        sale_id = res.data["id"]
        self.client.post(f"/api/sales/{sale_id}/complete/", {"amount_paid": "0.00"}, format="json")

        detail = self.client.get(f"/api/sales/{sale_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["payment_status"], "overdue")

    def test_payment_history_preserved(self):
        res = self.client.post(
            "/api/sales/",
            self._credit_payload(assigned_to=self.delivery.id),
            format="json",
        )
        sale_id = res.data["id"]
        self.client.post(f"/api/sales/{sale_id}/complete/", {"amount_paid": "0.00"}, format="json")
        self.client.post(
            f"/api/sales/{sale_id}/payments/",
            {"amount": "50.00", "payment_method": "cash"},
            format="json",
        )
        sale = Sale.objects.get(id=sale_id)
        self.assertEqual(sale.payments.count(), 1)


class CreditSummaryTests(TestCase):
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
        self.customer = Customer.objects.create(name="Credit Customer", is_wholesale_customer=True)
        self.category = Category.objects.create(name="Bulk")
        self.product = Product.objects.create(
            name="Rice",
            sku="RC-001",
            category=self.category,
            cost_price="50.00",
            selling_price="80.00",
            retail_price="80.00",
            wholesale_price="70.00",
            wholesale_threshold=5,
        )
        self.unit = ProductUnit.objects.create(
            product=self.product,
            unit_name="Bag",
            unit_code="bag",
            conversion_to_base_unit=1,
            is_base_unit=True,
            retail_price="80.00",
            wholesale_price="70.00",
            wholesale_threshold=5,
        )
        Inventory.objects.create(branch=self.branch, product=self.product, quantity=100, reorder_level=5)

        self.cashier = User.objects.create_user(
            "cashier_summary",
            email="cashier_summary@example.com",
            password="password123",
            first_name="Cashier",
            last_name="Summary",
            role="cashier",
        )
        self.delivery = User.objects.create_user(
            "delivery_summary",
            email="delivery_summary@example.com",
            password="password123",
            first_name="Delivery",
            last_name="Summary",
            role="deliver_person",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.cashier)

    def _create_credit_sale(self, *, due_date=None):
        payload = {
            "branch": str(self.branch.id),
            "customer": str(self.customer.id),
            "sale_type": "wholesale",
            "is_credit_sale": True,
            "assigned_to": str(self.delivery.id),
            "discount": "0.00",
            "amount_paid": "0.00",
            "items": [{"product": str(self.product.id), "product_unit": str(self.unit.id), "quantity": 5}],
        }
        if due_date:
            payload["due_date"] = due_date
        res = self.client.post("/api/sales/", payload, format="json")
        sale_id = res.data["id"]
        self.client.post(f"/api/sales/{sale_id}/complete/", {"amount_paid": "0.00"}, format="json")
        return sale_id

    def test_customer_summary_endpoint(self):
        self._create_credit_sale(due_date="2020-01-01")
        res = self.client.get(f"/api/sales/credit/customer/{self.customer.id}/summary/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("total_outstanding", res.data)
        self.assertIn("overdue_balance", res.data)
        self.assertGreaterEqual(res.data["open_count"], 1)

    def test_assigned_summary_endpoint(self):
        self._create_credit_sale(due_date="2020-01-01")
        res = self.client.get(f"/api/sales/credit/assigned/{self.delivery.id}/summary/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("total_outstanding", res.data)
        self.assertIn("overdue_balance", res.data)
        self.assertGreaterEqual(res.data["open_count"], 1)
