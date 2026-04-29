package com.stery.bluetoothprintbridge

import android.graphics.Bitmap
import android.graphics.Color
import java.io.ByteArrayOutputStream
import java.nio.charset.Charset

object EscPos {
    private val charset: Charset = Charsets.US_ASCII

    fun init(): ByteArray = byteArrayOf(0x1B, 0x40)

    fun bold(on: Boolean): ByteArray = byteArrayOf(0x1B, 0x45, if (on) 0x01 else 0x00)

    fun alignCenter(): ByteArray = byteArrayOf(0x1B, 0x61, 0x01)

    fun alignLeft(): ByteArray = byteArrayOf(0x1B, 0x61, 0x00)

    fun doubleSize(on: Boolean): ByteArray = byteArrayOf(0x1D, 0x21, if (on) 0x11 else 0x00)

    fun feed(lines: Int = 1): ByteArray = byteArrayOf(0x1B, 0x64, lines.coerceAtLeast(0).toByte())

    fun cut(): ByteArray = byteArrayOf(0x1D, 0x56, 0x00)

    fun logo(bitmap: Bitmap, targetWidth: Int = 384): ByteArray {
        val scaled = scaleToWidth(bitmap, targetWidth)
        val width = scaled.width
        val height = scaled.height
        val bytesPerRow = (width + 7) / 8
        val data = ByteArrayOutputStream()
        data.write(byteArrayOf(0x1D, 0x76, 0x30, 0x00))
        data.write(byteArrayOf((bytesPerRow and 0xFF).toByte(), ((bytesPerRow shr 8) and 0xFF).toByte()))
        data.write(byteArrayOf((height and 0xFF).toByte(), ((height shr 8) and 0xFF).toByte()))
        for (y in 0 until height) {
            for (xByte in 0 until bytesPerRow) {
                var value = 0
                for (bit in 0 until 8) {
                    val x = xByte * 8 + bit
                    value = value shl 1
                    if (x < width) {
                        val pixel = scaled.getPixel(x, y)
                        val luminance = (Color.red(pixel) * 0.299 + Color.green(pixel) * 0.587 + Color.blue(pixel) * 0.114)
                        if (luminance < 160) value = value or 0x01
                    }
                }
                data.write(value)
            }
        }
        return data.toByteArray()
    }

    fun text(value: String): ByteArray = sanitize(value).toByteArray(charset)

    fun line(value: String = ""): ByteArray = text("$value\n")

    fun receiptLines(lines: List<String>): ByteArray {
        val bytes = ArrayList<Byte>()
        fun add(arr: ByteArray) = arr.forEach { bytes.add(it) }
        add(init())
        lines.forEach { add(line(it)) }
        add(feed(3))
        add(cut())
        return bytes.toByteArray()
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
    }

    private fun scaleToWidth(source: Bitmap, targetWidth: Int): Bitmap {
        if (source.width <= targetWidth) return source
        val ratio = targetWidth.toFloat() / source.width.toFloat()
        val targetHeight = (source.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true)
    }
}
