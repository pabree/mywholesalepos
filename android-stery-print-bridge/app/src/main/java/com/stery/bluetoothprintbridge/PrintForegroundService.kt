package com.stery.bluetoothprintbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PrintForegroundService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!PrintJobState.isPrinting.compareAndSet(false, true)) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification())

        val json = intent?.getStringExtra(EXTRA_JSON)
        val text = intent?.getStringExtra(EXTRA_TEXT)
        val testPrint = intent?.getBooleanExtra(EXTRA_TEST_PRINT, false) == true

        serviceScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    printJob(json, text, testPrint)
                }
                showToast("Print job sent")
            } catch (e: Exception) {
                showToast(e.message ?: "Print failed")
            } finally {
                PrintJobState.isPrinting.set(false)
                stopForegroundCompat()
                stopSelf(startId)
            }
        }

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun printJob(jsonBase64: String?, text: String?, testPrint: Boolean) {
        val job = PrintJobParser.fromIntentExtras(jsonBase64, text, testPrint)
        if (!hasBluetoothPermission()) {
            throw IllegalStateException("Bluetooth permission missing")
        }

        val manager = BluetoothPrinterManager(this)
        try {
            val selected = manager.selectedPrinter() ?: throw IllegalStateException("No printer selected")
            val adapter = BluetoothAdapter.getDefaultAdapter()
                ?: throw IllegalStateException("Bluetooth is not supported on this device")
            val device = adapter.bondedDevices.firstOrNull { it.address == selected.address }
                ?: throw IllegalStateException("Printer not paired")
            try {
                manager.connect(device)
            } catch (_: Exception) {
                throw IllegalStateException("Connection failed")
            }

            when {
                job.isTestPrint -> {
                    val receipt = ReceiptPayload(
                        storeName = "STERY WHOLESALERS",
                        branch = "Test Branch",
                        receiptNo = "TEST-001",
                        cashier = "Test Cashier",
                        customer = "Walk-in",
                        date = "2026-04-29 14:20",
                        items = listOf(
                            ReceiptItem(
                                name = "TEST RECEIPT PAPER",
                                qty = 1,
                                unitPrice = 1,
                                lineTotal = 1
                            )
                        ),
                        subtotal = 1.0,
                        total = 1.0,
                        paid = 1.0,
                        change = 0.0,
                        paymentMethod = "Cash",
                        footer = "Thank you for your business"
                    )
                    manager.printBytes(ReceiptFormatter(this@PrintForegroundService, ReceiptFormatter.RECEIPT_WIDTH).format(receipt))
                }
                job.payload != null -> {
                    val formatted = ReceiptFormatter(this@PrintForegroundService, ReceiptFormatter.RECEIPT_WIDTH).format(job.payload)
                    manager.printBytes(formatted)
                }
                !job.text.isNullOrBlank() -> {
                    manager.printBytes(EscPos.receiptLines(buildPlainText(job.text)))
                }
                else -> throw IllegalStateException("No printable data provided")
            }
        } finally {
            manager.close()
        }
    }

    private fun buildPlainText(text: String): List<String> {
        val cleaned = text.ifBlank { "Receipt" }
        return listOf(
            "STERY POS",
            "SALE RECEIPT",
            "",
            "Item / Price x Qty        Amt",
            cleaned,
            "",
            "Total                     0.00",
            "Paid                      0.00",
            "Balance                   0.00",
            "",
            "Thank you for your business"
        )
    }

    private fun hasBluetoothPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Print jobs",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Receipt printing jobs"
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Stery Print Bridge")
            .setContentText("Printing receipt...")
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun showToast(message: String) {
        CoroutineScope(Dispatchers.Main).launch {
            Toast.makeText(this@PrintForegroundService, message, Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        const val EXTRA_JSON = "extra_json"
        const val EXTRA_TEXT = "extra_text"
        const val EXTRA_TEST_PRINT = "extra_test_print"
        private const val CHANNEL_ID = "stery_print_jobs"
        private const val NOTIFICATION_ID = 9777
    }
}
