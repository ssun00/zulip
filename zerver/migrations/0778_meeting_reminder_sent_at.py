import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("zerver", "0777_meeting_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="meeting",
            name="reminder_sent_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]

