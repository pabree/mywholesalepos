from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0004_delivery_run_sale"),
        ("sales", "0017_alter_sale_payment_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="salepayment",
            name="collection_stage",
            field=models.CharField(
                choices=[
                    ("checkout", "Checkout"),
                    ("delivery", "Delivery"),
                    ("credit", "Credit"),
                ],
                default="checkout",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="delivery_run",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="payments",
                to="logistics.deliveryrun",
            ),
        ),
    ]
