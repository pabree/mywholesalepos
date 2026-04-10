from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("logistics", "0002_delivery_runs"),
    ]

    operations = [
        migrations.AddField(
            model_name="deliveryrun",
            name="recipient_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="deliveryrun",
            name="recipient_phone",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="deliveryrun",
            name="delivery_notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="deliveryrun",
            name="delivered_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
