package com.stery.bluetoothprintbridge

import org.json.JSONArray
import org.json.JSONObject

data class ReceiptItem(
    val name: String,
    val qty: Double,
    val unitPrice: Double,
    val lineTotal: Double,
)

data class ReceiptPayment(
    val method: String,
    val amount: Double? = null,
    val status: String? = null,
    val reference: String? = null,
    val date: String? = null,
    val note: String? = null,
)

data class ReceiptPayload(
    val storeName: String,
    val branch: String? = null,
    val receiptNo: String? = null,
    val cashier: String? = null,
    val cashierName: String? = null,
    val customer: String? = null,
    val customerName: String? = null,
    val date: String? = null,
    val items: List<ReceiptItem> = emptyList(),
    val subtotal: Double? = null,
    val discount: Double? = null,
    val tax: Double? = null,
    val vat: Double? = null,
    val netAmount: Double? = null,
    val total: Double? = null,
    val paid: Double? = null,
    val change: Double? = null,
    val balance: Double? = null,
    val paymentMethod: String? = null,
    val paymentStatus: String? = null,
    val saleType: String? = null,
    val isCredit: Boolean = false,
    val footer: String? = null,
    val printLogo: Boolean = false,
    val duplicateLabel: String? = null,
    val note: String? = null,
    val payments: List<ReceiptPayment> = emptyList(),
    val conditions: List<String> = emptyList(),
) {
    companion object {
        fun fromJson(json: JSONObject): ReceiptPayload {
            val itemsArray = json.optJSONArray("items") ?: JSONArray()
            val paymentsArray = json.optJSONArray("payments") ?: JSONArray()
            val items = buildList {
                for (i in 0 until itemsArray.length()) {
                    val item = itemsArray.optJSONObject(i) ?: continue
                    add(
                        ReceiptItem(
                            name = item.optString("name")
                                .takeIf { it.isNotBlank() }
                                ?: item.optString("product_name")
                                .takeIf { it.isNotBlank() }
                                ?: item.optJSONObject("product")?.optString("name")?.takeIf { it.isNotBlank() }
                                ?: item.optJSONObject("product")?.optString("product_name")?.takeIf { it.isNotBlank() }
                                ?: item.optString("description", "Item"),
                            qty = item.optDouble("qty", 1.0),
                            unitPrice = item.optDouble("unitPrice", 0.0),
                            lineTotal = item.optDouble("lineTotal", item.optDouble("total", 0.0)),
                        )
                    )
                }
            }
            val payments = buildList {
                for (i in 0 until paymentsArray.length()) {
                    val payment = paymentsArray.optJSONObject(i) ?: continue
                    add(
                        ReceiptPayment(
                            method = payment.optString("method")
                                .takeIf { it.isNotBlank() }
                                ?: payment.optString("paymentMethod")
                                .takeIf { it.isNotBlank() }
                                ?: payment.optString("payment_method")
                                .takeIf { it.isNotBlank() }
                                ?: payment.optString("type", "Payment"),
                            amount = payment.optDoubleOrNull("amount")
                                ?: payment.optDoubleOrNull("paid_amount")
                                ?: payment.optDoubleOrNull("paidAmount"),
                            status = payment.optString("status").takeIf { it.isNotBlank() } ?: payment.optString("payment_status").takeIf { it.isNotBlank() },
                            reference = payment.optString("reference").takeIf { it.isNotBlank() } ?: payment.optString("payment_reference").takeIf { it.isNotBlank() } ?: payment.optString("code").takeIf { it.isNotBlank() },
                            date = payment.optString("date").takeIf { it.isNotBlank() } ?: payment.optString("created_at").takeIf { it.isNotBlank() } ?: payment.optString("createdAt").takeIf { it.isNotBlank() },
                            note = payment.optString("note").takeIf { it.isNotBlank() } ?: payment.optString("notes").takeIf { it.isNotBlank() },
                        )
                    )
                }
            }

            return ReceiptPayload(
                storeName = json.optString("storeName", "STERY WHOLESALERS"),
                branch = json.optString("branch").takeIf { it.isNotBlank() } ?: json.optString("branchName").takeIf { it.isNotBlank() },
                receiptNo = json.optString("receiptNo").takeIf { it.isNotBlank() }
                    ?: json.optString("receipt_no").takeIf { it.isNotBlank() }
                    ?: json.optString("invoice_no").takeIf { it.isNotBlank() }
                    ?: json.optString("invoiceNo").takeIf { it.isNotBlank() },
                cashier = json.optString("cashier").takeIf { it.isNotBlank() } ?: json.optString("cashierName").takeIf { it.isNotBlank() },
                cashierName = json.optString("cashierName").takeIf { it.isNotBlank() } ?: json.optString("cashier").takeIf { it.isNotBlank() },
                customer = json.optString("customer").takeIf { it.isNotBlank() } ?: json.optString("customerName").takeIf { it.isNotBlank() },
                customerName = json.optString("customerName").takeIf { it.isNotBlank() } ?: json.optString("customer").takeIf { it.isNotBlank() },
                date = json.optString("date").takeIf { it.isNotBlank() },
                items = items,
                subtotal = json.optDoubleOrNull("subtotal"),
                discount = json.optDoubleOrNull("discount"),
                tax = json.optDoubleOrNull("tax"),
                vat = json.optDoubleOrNull("vat"),
                netAmount = json.optDoubleOrNull("netAmount"),
                total = json.optDoubleOrNull("total"),
                paid = json.optDoubleOrNull("paid"),
                change = json.optDoubleOrNull("change"),
                balance = json.optDoubleOrNull("balance") ?: json.optDoubleOrNull("balance_due"),
                paymentMethod = json.optString("paymentMethod").takeIf { it.isNotBlank() },
                paymentStatus = json.optString("paymentStatus").takeIf { it.isNotBlank() } ?: json.optString("payment_status").takeIf { it.isNotBlank() },
                saleType = json.optString("saleType").takeIf { it.isNotBlank() } ?: json.optString("sale_type").takeIf { it.isNotBlank() } ?: json.optString("saleTypeName").takeIf { it.isNotBlank() },
                isCredit = json.optBoolean("isCredit", false) || json.optBoolean("is_credit", false) || json.optBoolean("is_credit_sale", false),
                footer = json.optString("footer").takeIf { it.isNotBlank() },
                printLogo = json.optBoolean("printLogo", false),
                duplicateLabel = json.optString("duplicateLabel").takeIf { it.isNotBlank() },
                note = json.optString("note").takeIf { it.isNotBlank() },
                payments = payments,
                conditions = buildList {
                    val arr = json.optJSONArray("conditions") ?: JSONArray()
                    for (i in 0 until arr.length()) {
                        val value = arr.optString(i).takeIf { it.isNotBlank() } ?: continue
                        add(value)
                    }
                }.ifEmpty {
                    defaultConditions(
                        saleType = json.optString("saleType").takeIf { it.isNotBlank() } ?: json.optString("sale_type").takeIf { it.isNotBlank() } ?: "",
                        isCredit = json.optBoolean("isCredit", false) || json.optBoolean("is_credit", false) || json.optBoolean("is_credit_sale", false) || (json.optString("paymentStatus").contains("credit", ignoreCase = true))
                    )
                },
            )
        }
    }
}

private fun defaultConditions(saleType: String = "", isCredit: Boolean = false): List<String> {
    val base = mutableListOf(
        "Goods remain property of Stery's Wholesalers Limited until fully paid.",
        "Goods once sold cannot be returned.",
    )
    if (saleType.equals("wholesale", ignoreCase = true)) {
        base.add("Wholesale discounts apply only to qualifying quantities.")
    }
    if (isCredit) {
        base.add("Accounts are due on demand and overdue accounts attract interest at 3% per week.")
    }
    return base
}

private fun JSONObject.optDoubleOrNull(name: String): Double? {
    return if (has(name) && !isNull(name)) optDouble(name, Double.NaN).takeIf { !it.isNaN() } else null
}
