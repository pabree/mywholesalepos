from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0011_salereturns"),
    ]

    operations = [
        migrations.AddField(
            model_name="saleitem",
            name="cost_price_snapshot",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="saleitem",
            name="total_cost_snapshot",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="saleitem",
            name="gross_profit_snapshot",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
