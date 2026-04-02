from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0001_initial"),
        ("logistics", "0001_route"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="route",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="customers",
                to="logistics.route",
            ),
        ),
    ]
