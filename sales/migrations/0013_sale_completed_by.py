from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0012_saleitem_cost_snapshots"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="completed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="completed_sales",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
