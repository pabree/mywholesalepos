from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0017_alter_sale_payment_mode"),
        ("logistics", "0003_delivery_proof_of_delivery"),
    ]

    operations = [
        migrations.AlterField(
            model_name="deliveryrun",
            name="order",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="delivery_run", to="sales.customerorder"),
        ),
        migrations.AddField(
            model_name="deliveryrun",
            name="sale",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="delivery_run", to="sales.sale"),
        ),
    ]
