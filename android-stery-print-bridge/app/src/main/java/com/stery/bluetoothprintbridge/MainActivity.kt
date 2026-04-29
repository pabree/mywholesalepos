package com.stery.bluetoothprintbridge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var statusText: TextView
    private lateinit var selectedPrinterText: TextView
    private lateinit var permissionHintText: TextView
    private lateinit var printerListContainer: LinearLayout
    private lateinit var deepLinkMessageText: TextView
    private lateinit var testPrintButton: Button

    private val printerManager by lazy { BluetoothPrinterManager(this) }
    private var pendingDeepLink: PrintJob? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            permissionHintText.text = ""
            renderUi()
            refreshPrinterList()
            pendingDeepLink?.let { job ->
                pendingDeepLink = null
                launchPrintServiceOrQueue(job)
            }
        } else {
            permissionHintText.text = "Bluetooth permission missing. Printer list and printing require BLUETOOTH_CONNECT on Android 12+."
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setIntent(intent)

        statusText = findViewById(R.id.statusText)
        selectedPrinterText = findViewById(R.id.selectedPrinterText)
        permissionHintText = findViewById(R.id.permissionHintText)
        printerListContainer = findViewById(R.id.printerListContainer)
        deepLinkMessageText = findViewById(R.id.deepLinkMessageText)
        testPrintButton = findViewById(R.id.testPrintButton)

        testPrintButton.setOnClickListener {
            launchPrintServiceOrQueue(PrintJob(isTestPrint = true))
        }

        ensureBluetoothPermission()
        renderUi()
        refreshPrinterList()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        renderUi()
    }

    private fun ensureBluetoothPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            permissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }

    private fun hasBluetoothPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private fun renderUi() {
        val selected = printerManager.selectedPrinter()
        selectedPrinterText.text = selected?.let {
            "Selected printer: ${it.name}\n${it.address}"
        } ?: getString(R.string.no_printer_selected)
        statusText.text = when {
            !hasBluetoothPermission() -> "Bluetooth permission required"
            selected == null -> "Select a paired printer to continue"
            else -> "Ready to print to ${selected.name}"
        }
    }

    private fun refreshPrinterList() {
        printerListContainer.removeAllViews()
        if (!hasBluetoothPermission()) {
            permissionHintText.text = "Bluetooth permission missing. Please allow Bluetooth access to list paired devices."
            return
        }
        val devices = printerManager.bondedDevices()
        if (devices.isEmpty()) {
            addInfoRow("No paired Bluetooth devices found. Pair the thermal printer in Android settings first.")
            return
        }
        permissionHintText.text = ""
        devices.forEach { device ->
            val button = Button(this).apply {
                text = "${device.name}\n${device.address}"
                isAllCaps = false
                setOnClickListener {
                    selectPrinter(device)
                }
            }
            printerListContainer.addView(button)
        }
    }

    private fun addInfoRow(message: String) {
        val text = TextView(this).apply {
            text = message
        }
        printerListContainer.addView(text)
    }

    private fun selectPrinter(device: BluetoothPrinterManager.PrinterDevice) {
        val bonded = BluetoothPrinterManager(this).bondedDevices().firstOrNull { it.address == device.address }
        if (bonded == null) {
            deepLinkMessageText.text = "Printer not paired"
            return
        }
        printerManager.saveSelectedPrinter(device.address)
        deepLinkMessageText.text = "Saved printer: ${device.name}"
        renderUi()
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "steryprint" || data.host != "print") return

        val jsonData = data.getQueryParameter("data")
        val text = data.getQueryParameter("text").orEmpty()
        val job = when {
            !jsonData.isNullOrBlank() -> PrintJobParser.fromIntentExtras(jsonBase64Url = jsonData)
            text.isNotBlank() -> PrintJob(text = text)
            else -> null
        }

        if (job == null) {
            deepLinkMessageText.text = "No printable data provided"
            return
        }

        deepLinkMessageText.text = "Print job sent"
        launchPrintServiceOrQueue(job)
    }

    private fun launchPrintServiceOrQueue(job: PrintJob) {
        if (!hasBluetoothPermission()) {
            pendingDeepLink = job
            deepLinkMessageText.text = "Bluetooth permission required"
            return
        }
        if (PrintJobState.isPrinting.get()) {
            deepLinkMessageText.text = "Print already in progress"
            return
        }
        launchPrintService(job)
    }

    private fun launchPrintService(job: PrintJob) {
        val intent = Intent(this, PrintForegroundService::class.java).apply {
            putExtra(PrintForegroundService.EXTRA_JSON, job.payload?.let { encodePayload(it) })
            putExtra(PrintForegroundService.EXTRA_TEXT, job.text)
            putExtra(PrintForegroundService.EXTRA_TEST_PRINT, job.isTestPrint)
        }
        ContextCompat.startForegroundService(this, intent)
    }

    private fun encodePayload(payload: ReceiptPayload): String {
        val json = org.json.JSONObject().apply {
            put("storeName", payload.storeName)
            payload.branch?.let { put("branch", it) }
            payload.receiptNo?.let { put("receiptNo", it) }
            payload.cashier?.let { put("cashier", it) }
            payload.customer?.let { put("customer", it) }
            payload.date?.let { put("date", it) }
            put("items", org.json.JSONArray().apply {
                payload.items.forEach { item ->
                    put(org.json.JSONObject().apply {
                        put("name", item.name)
                        put("qty", item.qty)
                        put("unitPrice", item.unitPrice)
                        put("lineTotal", item.lineTotal)
                    })
                }
            })
            payload.subtotal?.let { put("subtotal", it) }
            payload.discount?.let { put("discount", it) }
            payload.tax?.let { put("tax", it) }
            payload.total?.let { put("total", it) }
            payload.paid?.let { put("paid", it) }
            payload.change?.let { put("change", it) }
            payload.paymentMethod?.let { put("paymentMethod", it) }
            payload.footer?.let { put("footer", it) }
            put("printLogo", payload.printLogo)
            payload.duplicateLabel?.let { put("duplicateLabel", it) }
            payload.note?.let { put("note", it) }
        }
        return android.util.Base64.encodeToString(json.toString().toByteArray(Charsets.UTF_8), android.util.Base64.NO_WRAP or android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING)
    }
}
