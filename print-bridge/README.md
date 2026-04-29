# Stery POS Print Bridge

Local Node print bridge for PC USB thermal receipt printers.

## Health

```bash
curl http://127.0.0.1:9777/health
```

Expected:

```json
{"ok":true,"service":"stery-pos-print-bridge"}
```

## Receipt JSON contract

The bridge accepts the same receipt payload shape as the Android print bridge:

```json
{
  "storeName": "STERY WHOLESALERS",
  "branch": "Bukembe Branch",
  "receiptNo": "RCP-001",
  "cashier": "Jay",
  "customer": "Walk-in Customer",
  "date": "2026-04-29 14:20",
  "items": [
    {"name": "Sugar 2kg", "qty": 2, "unitPrice": 250, "lineTotal": 500}
  ],
  "subtotal": 500,
  "discount": 0,
  "tax": 0,
  "total": 500,
  "paid": 1000,
  "change": 500,
  "paymentMethod": "Cash",
  "footer": "Thank you for shopping with us",
  "printLogo": false,
  "duplicateLabel": "CUSTOMER COPY",
  "note": "Optional note"
}
```

## Print endpoints

### POST `/print/receipt`

Requires receipt JSON.

```bash
curl -X POST http://127.0.0.1:9777/print/receipt \
  -H "Content-Type: application/json" \
  -d @examples/sample-receipt.json
```

### POST `/print`

Accepts:
- `{ "text": "plain text" }`
- `{ "html": "<html>...</html>" }`
- full receipt JSON
- `{ "receipt": { ...receipt json... } }`

Example:

```bash
curl -X POST http://127.0.0.1:9777/print \
  -H "Content-Type: application/json" \
  -d '{"receipt":{"storeName":"STERY WHOLESALERS","receiptNo":"RCP-001","items":[{"name":"Sugar 2kg","qty":2,"unitPrice":250,"lineTotal":500}],"total":500,"paid":1000,"change":500}}'
```

## Scripts

```bash
npm run check
npm run test:receipt
```

## Local test payload

```bash
node -e "const fs=require('fs'); const {formatReceiptText}=require('./receiptFormatter'); const {normalizeReceiptPayload}=require('./receiptPayload'); const r=normalizeReceiptPayload(JSON.parse(fs.readFileSync('./examples/sample-receipt.json','utf8'))); console.log(formatReceiptText(r));"
```

## Notes

- `text=` and HTML payload support remain available.
- Receipt JSON is the preferred path for PC and Android so both print bridges share one payload shape.
- The bridge still uses the configured printer and ESC/POS raw output path on supported platforms.
