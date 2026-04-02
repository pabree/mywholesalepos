# Generated manually on 2026-04-01

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0003_customer_can_view_balance_customer_user"),
        ("sales", "0010_ledgerentry"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SaleReturn",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("correlation_id", models.UUIDField(unique=True, default=uuid.uuid4, editable=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("reason", models.TextField(blank=True, default="")),
                ("total_refund_amount", models.DecimalField(max_digits=12, decimal_places=2, default=0)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="customers.customer")),
                ("processed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="processed_returns", to=settings.AUTH_USER_MODEL)),
                ("sale", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="returns", to="sales.sale")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="SaleReturnItem",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("correlation_id", models.UUIDField(unique=True, default=uuid.uuid4, editable=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("quantity_returned", models.PositiveIntegerField()),
                ("refund_amount", models.DecimalField(max_digits=12, decimal_places=2)),
                ("restock_to_inventory", models.BooleanField(default=True)),
                ("base_quantity_returned", models.PositiveIntegerField(default=0)),
                ("note", models.TextField(blank=True, default="")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("sale_item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="return_items", to="sales.saleitem")),
                ("sale_return", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="sales.salereturn")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
