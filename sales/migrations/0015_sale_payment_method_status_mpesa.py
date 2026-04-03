from django.db import migrations, models
from django.db.models import Q


def backfill_payment_method(apps, schema_editor):
    SalePayment = apps.get_model("sales", "SalePayment")
    SalePayment.objects.filter(method__isnull=True).update(method="cash")
    SalePayment.objects.filter(method="").update(method="cash")


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0014_sale_route_snapshot"),
    ]

    operations = [
        migrations.RenameField(
            model_name="salepayment",
            old_name="payment_method",
            new_name="method",
        ),
        migrations.AddField(
            model_name="salepayment",
            name="status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("completed", "Completed"), ("failed", "Failed")],
                default="completed",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.RunPython(backfill_payment_method, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="salepayment",
            name="method",
            field=models.CharField(
                choices=[("cash", "Cash"), ("mpesa", "M-Pesa")],
                default="cash",
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name="salepayment",
            constraint=models.UniqueConstraint(
                fields=("reference",),
                condition=Q(reference__gt="", method="mpesa"),
                name="uniq_mpesa_reference",
            ),
        ),
    ]
