from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0015_sale_payment_method_status_mpesa"),
    ]

    operations = [
        migrations.AddField(
            model_name="salepayment",
            name="provider",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="provider_request_id",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="provider_checkout_id",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="provider_result_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="provider_result_desc",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="provider_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="raw_callback",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="verified_payments",
                to="accounts.user",
            ),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="salepayment",
            name="applied_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="salepayment",
            constraint=models.UniqueConstraint(
                fields=("provider_checkout_id",),
                condition=Q(provider_checkout_id__gt="", provider="mpesa"),
                name="uniq_mpesa_checkout_id",
            ),
        ),
    ]
