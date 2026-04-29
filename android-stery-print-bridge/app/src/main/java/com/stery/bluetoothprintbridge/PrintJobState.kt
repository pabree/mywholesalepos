package com.stery.bluetoothprintbridge

import java.util.concurrent.atomic.AtomicBoolean

object PrintJobState {
    val isPrinting: AtomicBoolean = AtomicBoolean(false)
}
