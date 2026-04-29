package com.stery.bluetoothprintbridge

import org.json.JSONArray
import org.json.JSONObject

data class ReceiptItem(
    val name: String,
    val qty: Double,
    val unitPrice: Double,
    val lineTotal: Double,
)

data class ReceiptPayload(
    val storeName: String,
    val branch: String? = null,
    val receiptNo: String? = null,
    val cashier: String? = null,
    val customer: String? = null,
    val date: String? = null,
    val items: List<ReceiptItem> = emptyList(),
    val subtotal: Double? = null,
    val discount: Double? = null,
    val tax: Double? = null,
    val total: Double? = null,
    val paid: Double? = null,
    val change: Double? = null,
    val paymentMethod: String? = null,
    val footer: String? = null,
    val printLogo: Boolean = false,
    val duplicateLabel: String? = null,
    val note: String? = null,
) {
    companion object {
        fun fromJson(json: JSONObject): ReceiptPayload {
            val itemsArray = json.optJSONArray("items") ?: JSONArray()
            val items = buildList {
                for (i in 0 until itemsArray.length()) {
                    val item = itemsArray.optJSONObject(i) ?: continue
                    add(
                        ReceiptItem(
                            name = item.optString("name", "Item"),
                            qty = item.optDouble("qty", 1.0),
                            unitPrice = item.optDouble("unitPrice", 0.0),
                            lineTotal = item.optDouble("lineTotal", item.optDouble("total", 0.0)),
                        )
                    )
                }
            }

            return ReceiptPayload(
                storeName = json.optString("storeName", "STERY POS"),
                branch = json.optString("branch").takeIf { it.isNotBlank() },
                receiptNo = json.optString("receiptNo").takeIf { it.isNotBlank() },
                cashier = json.optString("cashier").takeIf { it.isNotBlank() },
                customer = json.optString("customer").takeIf { it.isNotBlank() },
                date = json.optString("date").takeIf { it.isNotBlank() },
                items = items,
                subtotal = json.optDoubleOrNull("subtotal"),
                discount = json.optDoubleOrNull("discount"),
                tax = json.optDoubleOrNull("tax"),
                total = json.optDoubleOrNull("total"),
                paid = json.optDoubleOrNull("paid"),
                change = json.optDoubleOrNull("change"),
                paymentMethod = json.optString("paymentMethod").takeIf { it.isNotBlank() },
                footer = json.optString("footer").takeIf { it.isNotBlank() },
                printLogo = json.optBoolean("printLogo", false),
                duplicateLabel = json.optString("duplicateLabel").takeIf { it.isNotBlank() },
                note = json.optString("note").takeIf { it.isNotBlank() },
            )
        }
    }
}

private fun JSONObject.optDoubleOrNull(name: String): Double? {
    return if (has(name) && !isNull(name)) optDouble(name, Double.NaN).takeIf { !it.isNaN() } else null
}
