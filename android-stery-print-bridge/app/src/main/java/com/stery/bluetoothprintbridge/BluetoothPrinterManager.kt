package com.stery.bluetoothprintbridge

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresPermission
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

class BluetoothPrinterManager(private val context: Context) {

    data class PrinterDevice(val name: String, val address: String)

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private var socket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null

    fun bondedDevices(): List<PrinterDevice> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        return try {
            adapter.bondedDevices.orEmpty()
                .map { device -> PrinterDevice(device.safeName(), device.address) }
                .sortedBy { it.name.lowercase() }
        } catch (_: SecurityException) {
            emptyList()
        }
    }

    fun selectedPrinter(): PrinterDevice? {
        val address = prefs.getString(KEY_SELECTED_ADDRESS, null) ?: return null
        return try {
            val device = BluetoothAdapter.getDefaultAdapter()?.bondedDevices?.firstOrNull { it.address == address } ?: return null
            PrinterDevice(device.safeName(), device.address)
        } catch (_: SecurityException) {
            null
        }
    }

    fun saveSelectedPrinter(device: BluetoothDevice) {
        prefs.edit()
            .putString(KEY_SELECTED_NAME, device.safeName())
            .putString(KEY_SELECTED_ADDRESS, device.address)
            .apply()
    }

    fun saveSelectedPrinter(address: String) {
        val device = BluetoothAdapter.getDefaultAdapter()?.bondedDevices?.firstOrNull { it.address == address }
            ?: throw IllegalStateException("Printer not paired")
        saveSelectedPrinter(device)
    }

    @RequiresPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
    fun connectSelectedPrinter(): String {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: throw IllegalStateException("Bluetooth is not supported on this device")
        val address = prefs.getString(KEY_SELECTED_ADDRESS, null) ?: throw IllegalStateException("No printer selected")
        val device = adapter.bondedDevices.firstOrNull { it.address == address } ?: throw IllegalStateException("Printer not paired")
        return connect(device)
    }

    @RequiresPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
    fun connect(device: BluetoothDevice): String {
        close()
        val uuid = UUID.fromString(SPP_UUID)
        val connectedSocket = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            device.createRfcommSocketToServiceRecord(uuid)
        } else {
            device.createRfcommSocketToServiceRecord(uuid)
        }
        connectedSocket.connect()
        socket = connectedSocket
        outputStream = connectedSocket.outputStream
        return device.safeName()
    }

    @RequiresPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
    fun printBytes(bytes: ByteArray) {
        val stream = outputStream ?: throw IllegalStateException("Printer is not connected")
        try {
            stream.write(bytes)
            stream.flush()
        } catch (e: IOException) {
            close()
            throw e
        }
    }

    @RequiresPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
    fun printText(text: String) {
        printBytes(EscPos.receiptLines(text.lines().ifEmpty { listOf(text) }))
    }

    @RequiresPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
    fun close() {
        try {
            outputStream?.close()
        } catch (_: Exception) {
        } finally {
            outputStream = null
        }
        try {
            socket?.close()
        } catch (_: Exception) {
        } finally {
            socket = null
        }
    }

    private fun BluetoothDevice.safeName(): String {
        return try {
            name ?: address
        } catch (_: SecurityException) {
            address
        }
    }

    companion object {
        private const val PREFS_NAME = "stery_print_bridge"
        private const val KEY_SELECTED_NAME = "selected_name"
        private const val KEY_SELECTED_ADDRESS = "selected_address"
        private const val SPP_UUID = "00001101-0000-1000-8000-00805F9B34FB"
    }
}
