import base64
import os
import re
from datetime import timedelta

import requests
from django.utils import timezone


MPESA_ENV = (os.getenv("MPESA_ENV") or "sandbox").lower()

BASE_URLS = {
    "sandbox": "https://sandbox.safaricom.co.ke",
    "production": "https://api.safaricom.co.ke",
    "prod": "https://api.safaricom.co.ke",
}

_TOKEN_CACHE = {
    "token": None,
    "expires_at": None,
}


def _base_url():
    return BASE_URLS.get(MPESA_ENV, BASE_URLS["sandbox"])


def _require_env(name):
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing {name} environment variable.")
    return value


def normalize_phone_number(phone_number: str) -> str:
    if not phone_number:
        raise ValueError("Phone number is required.")
    digits = re.sub(r"\D", "", phone_number)
    if digits.startswith("0") and len(digits) == 10:
        return f"254{digits[1:]}"
    if digits.startswith("254") and len(digits) == 12:
        return digits
    if digits.startswith("7") and len(digits) == 9:
        return f"254{digits}"
    raise ValueError("Invalid phone number format.")


def _build_password(shortcode: str, passkey: str, timestamp: str) -> str:
    raw = f"{shortcode}{passkey}{timestamp}".encode("utf-8")
    return base64.b64encode(raw).decode("utf-8")


def get_access_token():
    if _TOKEN_CACHE["token"] and _TOKEN_CACHE["expires_at"]:
        if timezone.now() < _TOKEN_CACHE["expires_at"]:
            return _TOKEN_CACHE["token"]

    consumer_key = _require_env("MPESA_CONSUMER_KEY")
    consumer_secret = _require_env("MPESA_CONSUMER_SECRET")
    url = f"{_base_url()}/oauth/v1/generate?grant_type=client_credentials"
    response = requests.get(url, auth=(consumer_key, consumer_secret), timeout=20)
    response.raise_for_status()
    data = response.json()
    token = data.get("access_token")
    expires_in = int(data.get("expires_in", 3599))
    if not token:
        raise ValueError("Failed to obtain M-Pesa access token.")
    _TOKEN_CACHE["token"] = token
    _TOKEN_CACHE["expires_at"] = timezone.now() + timedelta(seconds=expires_in - 30)
    return token


def stk_push(*, amount, phone_number, account_reference, transaction_desc):
    shortcode = _require_env("MPESA_SHORTCODE")
    passkey = _require_env("MPESA_PASSKEY")
    callback_url = _require_env("MPESA_CALLBACK_URL")

    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    password = _build_password(shortcode, passkey, timestamp)
    token = get_access_token()

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": phone_number,
        "PartyB": shortcode,
        "PhoneNumber": phone_number,
        "CallBackURL": callback_url,
        "AccountReference": account_reference,
        "TransactionDesc": transaction_desc,
    }

    response = requests.post(
        f"{_base_url()}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return payload, data


def parse_callback_metadata(callback):
    metadata = {}
    items = (
        callback
        .get("CallbackMetadata", {})
        .get("Item", [])
    )
    for item in items:
        name = item.get("Name")
        value = item.get("Value")
        if name:
            metadata[name] = value
    return metadata
