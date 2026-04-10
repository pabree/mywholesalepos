import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0001_route"),
        ("business", "0001_initial"),
        ("sales", "0017_alter_sale_payment_mode"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DeliveryRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("correlation_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("status", models.CharField(choices=[("assigned", "Assigned"), ("picked_up", "Picked up"), ("en_route", "En route"), ("arrived", "Arrived"), ("delivered", "Delivered"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="assigned", max_length=20)),
                ("assigned_at", models.DateTimeField(auto_now_add=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("failed_at", models.DateTimeField(blank=True, null=True)),
                ("start_latitude", models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
                ("start_longitude", models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
                ("end_latitude", models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
                ("end_longitude", models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
                ("last_known_latitude", models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
                ("last_known_longitude", models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True)),
                ("last_ping_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="delivery_runs", to="business.branch")),
                ("delivery_person", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="delivery_runs", to=settings.AUTH_USER_MODEL)),
                ("order", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="delivery_run", to="sales.customerorder")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="DeliveryLocationPing",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("correlation_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_%(class)s_set", to=settings.AUTH_USER_MODEL)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("latitude", models.DecimalField(decimal_places=6, max_digits=10)),
                ("longitude", models.DecimalField(decimal_places=6, max_digits=10)),
                ("accuracy_meters", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("speed_kph", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("heading_degrees", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("battery_level", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("recorded_at", models.DateTimeField()),
                ("delivery_person", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="delivery_location_pings", to=settings.AUTH_USER_MODEL)),
                ("delivery_run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="pings", to="logistics.deliveryrun")),
            ],
            options={
                "ordering": ["-recorded_at"],
            },
        ),
    ]
