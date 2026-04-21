from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0018_sale_payment_delivery_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="salepayment",
            name="remittance_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("remitted", "Remitted"),
                    ("disputed", "Disputed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="remitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="remitted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="remitted_payments",
                to="accounts.user",
            ),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="remittance_note",
            field=models.TextField(blank=True, default=""),
        ),
    ]
