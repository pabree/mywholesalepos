package com.stery.bluetoothprintbridge

import android.content.Context
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import java.util.Locale

class ReceiptFormatter(
    private val context: Context? = null,
    private val width: Int = 32,
) {

    fun format(payload: ReceiptPayload): ByteArray {
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
        if (!payload.cashier.isNullOrBlank()) emitKeyValue(out, "Cashier", payload.cashier)
        if (!payload.customer.isNullOrBlank()) emitKeyValue(out, "Customer", payload.customer)
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
        payload.tax?.let { emitKeyValue(out, "Tax", money(it)) }
        payload.total?.let { emitBoldKeyValue(out, "TOTAL", money(it)) }
        payload.paid?.let { emitKeyValue(out, "Paid", money(it)) }
        payload.change?.let { emitKeyValue(out, "Change", money(it)) }
        payload.paymentMethod?.takeIf { it.isNotBlank() }?.let { emitKeyValue(out, "Payment Method", it) }

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
        val qtyText = formatQty(item.qty)
        val unitText = money(item.unitPrice)
        val totalText = money(item.lineTotal)
        val nameWidth = ITEM_NAME_WIDTH.coerceAtMost(width - 12)
        val nameLines = wrapText(name, nameWidth)
        val firstLeft = nameLines.firstOrNull().orEmpty()
        val firstLine = leftRight(firstLeft, totalText)
        val result = mutableListOf(firstLine)
        if (nameLines.size > 1) {
            nameLines.drop(1).forEach { result.add("  $it") }
        }
        result.add("  ${qtyText} x ${unitText}")
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
