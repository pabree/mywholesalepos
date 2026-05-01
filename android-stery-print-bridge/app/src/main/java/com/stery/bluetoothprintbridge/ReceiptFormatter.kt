package com.stery.bluetoothprintbridge

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Log
import java.io.ByteArrayOutputStream
import java.util.Locale

class ReceiptFormatter(
    private val context: Context? = null,
    private val width: Int = 32,
) {

    fun format(payload: ReceiptPayload): ByteArray {
        val paymentStatus = payload.paymentStatus?.trim().orEmpty()
        val balanceDue = payload.balance ?: maxOf((payload.total ?: 0.0) - (payload.paid ?: 0.0), 0.0)
        val isCreditReceipt =
            payload.isCredit ||
                payload.saleType.equals("credit", ignoreCase = true) ||
                paymentStatus.contains("credit", ignoreCase = true) ||
                balanceDue > 0.0 ||
                (payload.total ?: 0.0) > (payload.paid ?: 0.0)
        Log.d(
            "PRINT",
            "ANDROID FORMAT CREDIT isCreditReceipt=$isCreditReceipt isCredit=${payload.isCredit} saleType=${payload.saleType} paymentStatus=${payload.paymentStatus} balance=${payload.balance} paid=${payload.paid}"
        )

        val out = ByteArrayOutputStream()
        emit(out, EscPos.init())
        emit(out, EscPos.alignCenter())
        emit(out, EscPos.bold(true))
        payload.duplicateLabel?.takeIf { it.isNotBlank() }?.let { emitLineCentered(out, it) }
        emit(out, EscPos.doubleSize(true))
        if (payload.printLogo) {
            renderLogo(out)
        }
        emitLineCentered(out, payload.storeName)
        emit(out, EscPos.doubleSize(false))
        emit(out, EscPos.bold(false))
        payload.branch?.takeIf { it.isNotBlank() }?.let { emitLineCentered(out, it) }
        emitLineCentered(out, "SALE RECEIPT")
        emit(out, EscPos.alignLeft())
        if (!payload.receiptNo.isNullOrBlank()) emitKeyValue(out, "Receipt", payload.receiptNo)
        if (!payload.date.isNullOrBlank()) emitKeyValue(out, "Date", payload.date)
        val cashierName = payload.cashierName ?: payload.cashier
        val customerName = payload.customerName ?: payload.customer
        val deliveryPerson = payload.deliveryPersonName ?: payload.deliveryPerson
        val effectiveConditions = if (isCreditReceipt) {
            payload.conditions + "Accounts are due on demand and overdue accounts attract interest at 3% per week."
        } else {
            payload.conditions
        }
        if (!cashierName.isNullOrBlank()) emitKeyValue(out, "Cashier", cashierName)
        if (!customerName.isNullOrBlank()) emitKeyValue(out, "Customer", customerName)
        if (!payload.saleType.isNullOrBlank()) emitKeyValue(out, "Sale Type", payload.saleType)
        if (isCreditReceipt && !deliveryPerson.isNullOrBlank()) emitKeyValue(out, "Delivery Person", deliveryPerson)
        if (isCreditReceipt) {
            emitCenteredBoldLine(out, "CREDIT SALE")
            if (!paymentStatus.isNullOrBlank() && !paymentStatus.equals("paid", ignoreCase = true)) emitKeyValue(out, "Status", paymentStatus)
            if (balanceDue > 0.0) emitBoldKeyValue(out, "BALANCE DUE", money(balanceDue))
        } else if (!paymentStatus.isNullOrBlank() && !paymentStatus.equals("paid", ignoreCase = true)) {
            emitKeyValue(out, "Status", paymentStatus)
        }
        payload.note?.takeIf { it.isNotBlank() }?.let {
            emitDivider(out)
            emitWrappedBlock(out, it)
        }

        emitDivider(out)
        emit(out, EscPos.bold(true))
        emitLine(out, leftRight("Item / Price x Qty", "Amt"))
        emit(out, EscPos.bold(false))
        emitDivider(out)

        payload.items.forEach { item ->
            formatItem(item).forEach { emitLine(out, it) }
        }

        emitDivider(out)
        payload.subtotal?.let { emitKeyValue(out, "Subtotal", money(it)) }
        payload.discount?.let { emitKeyValue(out, "Discount", money(it)) }
        (payload.vat ?: payload.tax)?.let { emitKeyValue(out, "VAT", money(it)) }
        payload.netAmount?.let { emitKeyValue(out, "Net", money(it)) }
        payload.total?.let { emitBoldKeyValue(out, "TOTAL", money(it)) }
        payload.paymentMethod?.takeIf { it.isNotBlank() }?.let { emitKeyValue(out, "Payment Method", it) }
        if (payload.payments.isNotEmpty()) {
            emitDivider(out)
            emitLineCentered(out, "PAYMENTS")
            payload.payments.forEach { payment ->
                val method = payment.method.ifBlank { payment.status ?: "Payment" }
                val amount = payment.amount?.let { money(it) } ?: ""
                emitKeyValue(out, method, amount.ifBlank { payment.reference ?: payment.status ?: "" })
                payment.reference?.takeIf { it.isNotBlank() }?.let { emitLine(out, "  Ref: $it") }
                payment.status?.takeIf { it.isNotBlank() && !it.equals("paid", ignoreCase = true) }?.let { emitLine(out, "  Status: $it") }
                payment.note?.takeIf { it.isNotBlank() }?.let { emitLine(out, "  Note: $it") }
            }
        }
        if (payload.paid != null && payload.paid > 0.0) emitKeyValue(out, "Paid", money(payload.paid))
        if (!isCreditReceipt && payload.change != null && payload.change > 0.0 && paymentStatus.equals("cash", ignoreCase = true)) emitKeyValue(out, "Change", money(payload.change))
        if (!isCreditReceipt && balanceDue > 0.0) {
            val label = if (isCreditReceipt) "BALANCE DUE" else "Balance"
            emitBoldKeyValue(out, label, money(balanceDue))
        }
        if (effectiveConditions.isNotEmpty()) {
            emitDivider(out)
            emitCenteredBoldLine(out, "CONDITIONS")
            effectiveConditions.forEachIndexed { index, condition ->
                wrapText(condition, width).forEachIndexed { partIndex, line ->
                    emitLine(out, if (partIndex == 0) "${index + 1}. $line" else "   $line")
                }
            }
        }

        emitDivider(out)
        payload.footer?.takeIf { it.isNotBlank() }?.let {
            emitCenteredBoldLine(out, it)
        } ?: emitCenteredBoldLine(out, "Thank you for shopping with us")
        emit(out, EscPos.feed(3))
        emit(out, EscPos.cut())
        return out.toByteArray()
    }

    private fun renderLogo(out: ByteArrayOutputStream) {
        try {
            val ctx = context ?: return
            val resId = ctx.resources.getIdentifier("stery_logo", "drawable", ctx.packageName)
            if (resId == 0) return
            val bitmap = BitmapFactory.decodeResource(ctx.resources, resId) ?: return
            emit(out, EscPos.alignCenter())
            emit(out, EscPos.logo(bitmap, targetWidth = 384))
            emit(out, EscPos.feed(1))
            emit(out, EscPos.alignLeft())
        } catch (_: Exception) {
            // Logo is optional.
        }
    }

    private fun formatItem(item: ReceiptItem): List<String> {
        val name = sanitize(item.name)
        Log.d("PRINT", "ANDROID ITEM NAME raw=$item resolved=$name")
        val qtyText = formatQty(item.qty)
        val unitText = money(item.unitPrice)
        val totalText = money(item.lineTotal)
        val nameWidth = ITEM_NAME_WIDTH.coerceAtMost(width - totalText.length - 1).coerceAtLeast(10)
        val nameLines = wrapText(name, nameWidth)
        val firstLeft = "${nameLines.firstOrNull().orEmpty()} $qtyText x ${unitText.removePrefix("KES ")}".trim()
        val firstLine = leftRight(firstLeft, totalText)
        val result = mutableListOf(firstLine)
        if (nameLines.size > 1) {
            nameLines.drop(1).forEach { result.add("  $it") }
        }
        return result
    }

    private fun emitLineCentered(out: ByteArrayOutputStream, text: String) {
        emit(out, EscPos.alignCenter())
        emitLine(out, text)
        emit(out, EscPos.alignLeft())
    }

    private fun emitCenteredBoldLine(out: ByteArrayOutputStream, text: String) {
        emit(out, EscPos.alignCenter())
        emit(out, EscPos.bold(true))
        emitLine(out, text)
        emit(out, EscPos.bold(false))
        emit(out, EscPos.alignLeft())
    }

    private fun emitWrappedBlock(out: ByteArrayOutputStream, text: String) {
        wrapText(text, width).forEach { emitLine(out, it) }
    }

    private fun emitKeyValue(out: ByteArrayOutputStream, left: String, right: String) {
        emitLine(out, leftRight(left, right))
    }

    private fun emitBoldKeyValue(out: ByteArrayOutputStream, left: String, right: String) {
        emit(out, EscPos.bold(true))
        emitLine(out, leftRight(left, right))
        emit(out, EscPos.bold(false))
    }

    private fun leftRight(left: String, right: String): String {
        val l = sanitize(left)
        val r = sanitize(right)
        val spaces = (width - l.length - r.length).coerceAtLeast(1)
        return if (l.length + r.length + spaces <= width) {
            l + " ".repeat(spaces) + r
        } else {
            "${l.take((width - r.length - 1).coerceAtLeast(1))} $r".trim()
        }
    }

    private fun wrapText(text: String, maxWidth: Int): List<String> {
        val words = sanitize(text).split(" ").filter { it.isNotBlank() }
        if (words.isEmpty()) return listOf("")
        val lines = mutableListOf<String>()
        var current = ""
        for (word in words) {
            val next = if (current.isBlank()) word else "$current $word"
            if (next.length > maxWidth && current.isNotBlank()) {
                lines.add(current)
                current = word
            } else {
                current = next
            }
        }
        if (current.isNotBlank()) lines.add(current)
        return lines
    }

    private fun emitDivider(out: ByteArrayOutputStream) {
        emitLine(out, "-".repeat(width))
    }

    private fun emitLine(out: ByteArrayOutputStream, text: String) {
        emit(out, EscPos.line(text))
    }

    private fun emit(out: ByteArrayOutputStream, bytes: ByteArray) {
        out.write(bytes)
    }

    private fun money(value: Double): String = "KES ${String.format(Locale.US, "%.2f", value)}"

    private fun formatQty(value: Double): String {
        return if (value == value.toInt().toDouble()) value.toInt().toString() else value.toString()
    }

    private fun sanitize(value: String): String {
        return value
            .replace("\u2018", "'")
            .replace("\u2019", "'")
            .replace("\u201C", "\"")
            .replace("\u201D", "\"")
            .replace("\u2013", "-")
            .replace("\u2014", "-")
            .replace(Regex("[^\\x09\\x0A\\x0D\\x20-\\x7E]"), "")
            .trim()
    }

    companion object {
        const val RECEIPT_WIDTH = 32
        const val ITEM_NAME_WIDTH = 16
    }
}
