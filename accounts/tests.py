from django.test import TestCase
from rest_framework.test import APIClient
from django.apps import apps as django_apps
from django.contrib.admin.sites import AdminSite
from accounts.models import User
from accounts.admin import UserAdmin
from accounts.migrations.0003_backfill_username import backfill_usernames


class RoleAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_token_returns_role(self):
        user = User.objects.create_user(
            "roleuser",
            email="roleuser@example.com",
            password="password123",
            first_name="Role",
            last_name="User",
            role="cashier",
        )
        res = self.client.post(
            "/api/auth/token/",
            {"username": user.username, "password": "password123"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)
        self.assertEqual(res.data.get("role"), "cashier")

    def test_login_with_wrong_username_fails(self):
        User.objects.create_user(
            "validuser",
            email="valid@example.com",
            password="password123",
            first_name="Valid",
            last_name="User",
            role="cashier",
        )
        res = self.client.post(
            "/api/auth/token/",
            {"username": "wronguser", "password": "password123"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_login_with_wrong_password_fails(self):
        User.objects.create_user(
            "validuser2",
            email="valid2@example.com",
            password="password123",
            first_name="Valid",
            last_name="User",
            role="cashier",
        )
        res = self.client.post(
            "/api/auth/token/",
            {"username": "validuser2", "password": "wrongpass"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_token_endpoint_allows_anonymous(self):
        res = self.client.post("/api/auth/token/", {"username": "nope", "password": "nope"}, format="json")
        self.assertNotEqual(res.status_code, 403)

    def test_role_permission_denies_non_sales_role(self):
        user = User.objects.create_user(
            "driver1",
            email="driver@example.com",
            password="password123",
            first_name="Driver",
            last_name="One",
            role="deliver_person",
        )
        self.client.force_authenticate(user=user)
        res = self.client.get("/api/sales/held/")
        self.assertEqual(res.status_code, 403)

    def test_role_permission_allows_cashier(self):
        user = User.objects.create_user(
            "cashier1",
            email="cashier@example.com",
            password="password123",
            first_name="Cash",
            last_name="ier",
            role="cashier",
        )
        self.client.force_authenticate(user=user)
        res = self.client.get("/api/customers/")
        self.assertEqual(res.status_code, 200)

    def test_current_user_endpoint_returns_role(self):
        user = User.objects.create_user(
            "meuser",
            email="me@example.com",
            password="password123",
            first_name="Me",
            last_name="User",
            role="salesperson",
        )
        self.client.force_authenticate(user=user)
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.get("role"), "salesperson")
        self.assertEqual(res.data.get("username"), user.username)

    def test_username_backfill_for_blank(self):
        user = User.objects.create_user(
            "tempuser",
            email="temp@example.com",
            password="password123",
            first_name="Temp",
            last_name="User",
            role="cashier",
        )
        User.objects.filter(pk=user.pk).update(username="")

        backfill_usernames(django_apps, None)
        user.refresh_from_db()
        self.assertTrue(user.username)

    def test_admin_includes_username_field(self):
        admin = UserAdmin(User, AdminSite())
        fieldsets = admin.get_fieldsets(request=None)
        fields = [f for _, opts in fieldsets for f in opts.get("fields", ())]
        self.assertIn("username", fields)
        add_fields = admin.add_fieldsets[0][1]["fields"]
        self.assertIn("username", add_fields)
