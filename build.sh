#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate --noinput

python manage.py shell <<'PY'
import os
from django.contrib.auth import get_user_model

username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "").strip()
email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip()
password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "").strip()

if not username or not email or not password:
    print("Superuser: skipped (missing DJANGO_SUPERUSER_USERNAME / EMAIL / PASSWORD).", flush=True)
else:
    User = get_user_model()
    if User.objects.filter(username=username).exists():
        print(f"Superuser: '{username}' already exists. Skipping.", flush=True)
    else:
        User.objects.create_superuser(username=username, email=email, password=password)
        print(f"Superuser: '{username}' created.", flush=True)
PY
