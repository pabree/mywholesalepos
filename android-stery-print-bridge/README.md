# Stery Bluetooth Print Bridge

Minimal Android Kotlin app that receives receipt data through a deep link and prints it to a paired Bluetooth ESC/POS printer.

## Important Android note

Printing is done through a **foreground service** with a small persistent notification while the job is running. Android 12+ restricts background service starts, and Android 14 requires the service type to be declared. This app does **not** attempt fully invisible background printing.

## Open in Android Studio

1. Open Android Studio.
2. Choose **Open**.
3. Select the `android-stery-print-bridge/` folder.
4. Let Gradle sync complete.
5. Run the app on an Android 6.0+ device.

## Pair the printer

1. Turn on the Bluetooth thermal printer.
2. Pair it from Android Bluetooth settings.
3. Open the app.
4. Allow Bluetooth permission when prompted.
5. Select the printer from the paired devices list.

The selected printer address is saved in `SharedPreferences`.

## Test the deep link

Use adb:

```bash
adb shell am start -a android.intent.action.VIEW -d "steryprint://print?text=Hello%20World"
```

Example browser link:

```text
steryprint://print?text=Test%20Receipt
```

## JSON receipt payload

The app also accepts a base64url-encoded JSON payload:

```text
steryprint://print?data=eyJzdG9yZU5hbWUiOiJTVEVSWSBXSE9MRVNBTEVTIiwiYnJhbmNoIjoiQnVrZW1iZSBCcmFuY2giLCJyZWNlaXB0Tm8iOiJSQ1AtMDAxIiwiY2FzaGllciI6Ik1hcnkiLCJjdXN0b21lciI6IldhbGstaW4gQ3VzdG9tZXIiLCJkYXRlIjoiMjAyNi0wNC0yOSAxNDoyMCIsIml0ZW1zIjpbeyJuYW1lIjoiU3VnYXIgMmsiLCJxdHkiOjIsInVuaXRQcmljZSI6MjUwLCJsaW5lVG90YWwiOjUwMH1dLCJzdWJ0b3RhbCI6NTAwLCJkaXNjb3VudCI6MCwidGF4IjowLCJ0b3RhbCI6NTAwLCJwYWlkIjoxMDAwLCJjaGFuZ2UiOjUwMCwicGF5bWVudE1ldGhvZCI6IkNhc2giLCJmb290ZXIiOiJUaGFuayB5b3UgZm9yIHNob3BwaW5nIHdpdGggdXMifQ
```

### JSON shape

```json
{
  "storeName": "STERY WHOLESALERS",
  "branch": "Bukembe Branch",
  "receiptNo": "RCP-001",
  "cashier": "Mary",
  "customer": "Walk-in Customer",
  "date": "2026-04-29 14:20",
  "items": [
    {
      "name": "Sugar 2kg",
      "qty": 2,
      "unitPrice": 250,
      "lineTotal": 500
    }
  ],
  "subtotal": 500,
  "discount": 0,
  "tax": 0,
  "total": 500,
  "paid": 1000,
  "change": 500,
  "paymentMethod": "Cash",
  "footer": "Thank you for shopping with us",
  "printLogo": true,
  "duplicateLabel": "CUSTOMER COPY",
  "note": "Thank you for shopping with us"
}
```

## JavaScript helper

```js
function openSteryPrint(receipt) {
  const json = JSON.stringify(receipt);
  const base64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  window.location.href = `steryprint://print?data=${base64}`;
}
```

## Logo support

If you want to print a logo, add a drawable resource named:

- `app/src/main/res/drawable/stery_logo.png`

Then set `"printLogo": true` in the JSON payload.

If the logo resource is missing, printing continues normally.

## Test print

Tap **Test Print** in the app to print a sample receipt.

## Permissions

The app uses:

- `BLUETOOTH_CONNECT` on Android 12+
- legacy `BLUETOOTH` and `BLUETOOTH_ADMIN` with `maxSdkVersion=30`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_CONNECTED_DEVICE`

`BLUETOOTH_SCAN` is not requested because this app only needs bonded devices.

## Notes

- Minimum SDK: 23
- Target SDK: 34
- ESC/POS output uses classic Bluetooth SPP UUID:
  `00001101-0000-1000-8000-00805F9B34FB`

## Manual test checklist

- Open the app in Android Studio.
- Pair a Bluetooth ESC/POS printer.
- Select the printer in the app.
- Tap **Test Print**.
- Run the plain-text deep link with adb:
  - `adb shell am start -a android.intent.action.VIEW -d "steryprint://print?text=Hello%20World"`
- Run the JSON deep link with adb:
  - `adb shell am start -a android.intent.action.VIEW -d "steryprint://print?data=<base64url-json>"`
- Confirm the notification `Printing receipt...` appears during printing.
- Confirm the service stops after the job finishes.
- Confirm the app still shows printer selection and test print UI.
- Confirm missing printer / invalid data errors are shown clearly.
