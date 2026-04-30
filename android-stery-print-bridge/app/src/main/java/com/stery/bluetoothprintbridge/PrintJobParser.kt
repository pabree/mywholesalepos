package com.stery.bluetoothprintbridge

import android.util.Base64
import android.util.Log
import org.json.JSONObject

data class PrintJob(
    val payload: ReceiptPayload? = null,
    val text: String? = null,
    val isTestPrint: Boolean = false,
)

object PrintJobParser {
    fun fromIntentExtras(
        jsonBase64Url: String? = null,
        plainText: String? = null,
        testPrint: Boolean = false,
    ): PrintJob {
        return when {
            !jsonBase64Url.isNullOrBlank() -> PrintJob(payload = decodeReceiptPayload(jsonBase64Url))
            !plainText.isNullOrBlank() -> PrintJob(text = plainText)
            testPrint -> PrintJob(isTestPrint = true)
            else -> throw IllegalArgumentException("No printable data provided")
        }
    }

    fun decodeReceiptPayload(encoded: String): ReceiptPayload {
        try {
            val normalized = encoded.replace('-', '+').replace('_', '/')
            val padding = when (normalized.length % 4) {
                2 -> "=="
                3 -> "="
                else -> ""
            }
            val raw = Base64.decode(normalized + padding, Base64.DEFAULT)
            val json = JSONObject(String(raw, Charsets.UTF_8))
            Log.d("PRINT", "decoded receipt json=$json")
            val payload = ReceiptPayload.fromJson(json)
            Log.d("PRINT", "decoded receipt payload=$payload")
            return payload
        } catch (e: Exception) {
            throw IllegalStateException("Invalid receipt data")
        }
    }
}
