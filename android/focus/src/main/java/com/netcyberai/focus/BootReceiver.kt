package com.netcyberai.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// After a restart or an update the lock starts again by itself (with the brand's autostart allowed, set-up step).
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) FocusService.start(ctx)
    }
}
