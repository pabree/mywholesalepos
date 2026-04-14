from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="systembackup",
            name="remote_error_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="systembackup",
            name="remote_storage_key",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="systembackup",
            name="remote_storage_type",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="systembackup",
            name="remote_upload_status",
            field=models.CharField(
                blank=True,
                choices=[("success", "Success"), ("failed", "Failed"), ("skipped", "Skipped")],
                default="skipped",
                max_length=20,
            ),
        ),
    ]
