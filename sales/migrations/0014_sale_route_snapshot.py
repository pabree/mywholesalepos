from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0013_sale_completed_by"),
        ("logistics", "0001_route"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="route_snapshot",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sales",
                to="logistics.route",
            ),
        ),
    ]
