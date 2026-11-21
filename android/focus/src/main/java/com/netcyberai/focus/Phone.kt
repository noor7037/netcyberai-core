package com.netcyberai.focus

import android.Manifest
import android.app.AppOpsManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import com.netcyberai.family.focus.AppSuggest
import com.netcyberai.family.focus.Brand
import com.netcyberai.family.focus.DevicePackages
import com.netcyberai.family.focus.OemGuide
import com.netcyberai.family.focus.OemStep

// What the Focus app reads from, and opens on, the phone itself (C538): its permissions, its apps, the packages the
// lock treats specially (DevicePackages), and the guided set-up screens, the brand's own first.
object Phone {
    const val FAMILY = AppSuggest.FAMILY_PACKAGE

    data class AppRow(val pkg: String, val label: String, val suggested: Boolean)

    val brand: Brand get() = OemGuide.brandOf(Build.MANUFACTURER ?: "", Build.BRAND ?: "")

    fun bootId(ctx: Context): String = Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT, 0).toString()

    // ---- permissions ------------------------------------------------------------------------------------------------

    fun hasUsageAccess(ctx: Context): Boolean {
        val ops = ctx.getSystemService(AppOpsManager::class.java) ?: return false
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun hasOverlay(ctx: Context): Boolean = Settings.canDrawOverlays(ctx)

    fun hasNotifications(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun ignoresBatteryOptimisation(ctx: Context): Boolean = ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true

    /** The two the lock cannot work without (the heartbeat's "its permissions are granted"). */
    fun lockPermissionsOk(ctx: Context): Boolean = hasUsageAccess(ctx) && hasOverlay(ctx)

    // ---- the phone's apps -------------------------------------------------------------------------------------------

    private fun handlers(ctx: Context, intent: Intent): Set<String> =
        ctx.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY or PackageManager.MATCH_ALL).map { it.activityInfo.packageName }.toSet()

    private fun browsers(ctx: Context): Set<String> =
        handlers(ctx, Intent(Intent.ACTION_VIEW, Uri.parse("https://example.org/")).addCategory(Intent.CATEGORY_BROWSABLE))

    private fun homes(ctx: Context): Set<String> = handlers(ctx, Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))

    /** The phone's own app list (launcher apps), with the suggested ones ticked; never our apps or the calling apps. */
    fun apps(ctx: Context): List<AppRow> {
        val pm = ctx.packageManager
        val device = devicePackages(ctx)
        val web = browsers(ctx)
        val never = device.alwaysOpen + device.lockedInLockTime + device.ownPackage + FAMILY + homes(ctx)
        return pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
            .map { it.activityInfo.applicationInfo }
            .distinctBy { it.packageName }
            .filter { it.packageName !in never }
            .map { ai ->
                AppRow(ai.packageName, pm.getApplicationLabel(ai).toString(), AppSuggest.suggested(ai.packageName, ai.category, ai.packageName in web))
            }
            .sortedWith(compareByDescending<AppRow> { it.suggested }.thenBy { it.label.lowercase() })
    }

    /**
     * The packages the lock treats specially on this phone (rules 4 and 8): the calling, messages and home-screen apps and
     * the Family app always open, whatever the brand calls them; Settings, the installers, the app stores and the brand's
     * security apps PIN only in lock times, including whatever this phone opens for "uninstall" or "app info".
     */
    fun devicePackages(ctx: Context): DevicePackages {
        val always = mutableSetOf<String>()
        always += DevicePackages.DEFAULT_ALWAYS_OPEN
        always += FAMILY
        runCatching { ctx.getSystemService(TelecomManager::class.java)?.defaultDialerPackage }.getOrNull()?.let { always += it }
        runCatching { Telephony.Sms.getDefaultSmsPackage(ctx) }.getOrNull()?.let { always += it }
        always += handlers(ctx, Intent(Intent.ACTION_DIAL))
        always += homes(ctx)
        val self = Uri.parse("package:${ctx.packageName}")
        val pinOnly = mutableSetOf<String>()
        pinOnly += DevicePackages.DEFAULT_LOCKED_IN_LOCK_TIME
        pinOnly += OemGuide.securityApps
        pinOnly += handlers(ctx, Intent(Settings.ACTION_SETTINGS))
        pinOnly += handlers(ctx, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, self))
        pinOnly += handlers(ctx, Intent(Intent.ACTION_DELETE, self))
        @Suppress("DEPRECATION")
        pinOnly += handlers(ctx, Intent(Intent.ACTION_UNINSTALL_PACKAGE, self))
        pinOnly += handlers(ctx, Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
        pinOnly += handlers(ctx, Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        // The home screen and the system bar are never covered, even where a brand lets them open settings.
        return DevicePackages(ownPackage = ctx.packageName, alwaysOpen = always, lockedInLockTime = pinOnly - always - ctx.packageName)
    }

    // ---- opening screens --------------------------------------------------------------------------------------------

    private fun start(ctx: Context, i: Intent): Boolean = try {
        ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    } catch (e: SecurityException) {
        false
    }

    fun openAppInfo(ctx: Context): Boolean = start(ctx, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))

    fun openOverlay(ctx: Context): Boolean =
        start(ctx, Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))) || start(ctx, Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))

    fun openUsageAccess(ctx: Context): Boolean =
        start(ctx, Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${ctx.packageName}"))) || start(ctx, Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))

    /** The brand's own screen for [step] where the phone has it (true), else App info (false). */
    fun openStep(ctx: Context, step: OemStep): Boolean {
        for (s in step.screens) {
            val i = if (s.cls != null) Intent().setComponent(ComponentName(s.pkg, s.cls!!)) else ctx.packageManager.getLaunchIntentForPackage(s.pkg) ?: continue
            for ((k, v) in s.extras) i.putExtra(k, if (v == OemGuide.SELF) ctx.packageName else v)
            if (start(ctx, i)) return true
        }
        openAppInfo(ctx)
        return false
    }

    /** Whether the brand has its own screen for [step] on this phone. */
    fun hasOwnScreen(ctx: Context, step: OemStep): Boolean = step.screens.any { s ->
        val i = if (s.cls != null) Intent().setComponent(ComponentName(s.pkg, s.cls!!)) else ctx.packageManager.getLaunchIntentForPackage(s.pkg)
        i != null && ctx.packageManager.resolveActivity(i, 0) != null
    }

    /**
     * Android 13 and later block "display over other apps" and usage access for an app installed from a file (not a
     * store) until the parent allows "restricted settings" in its App info (⋮ menu). No app can switch this itself.
     */
    fun restrictedSettingsLikely(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        val installer = runCatching { ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName }.getOrNull()
        return installer != "com.android.vending"
    }

    fun familyInstalled(ctx: Context): Boolean = ctx.packageManager.getLaunchIntentForPackage(FAMILY) != null

    fun openFamily(ctx: Context): Boolean = ctx.packageManager.getLaunchIntentForPackage(FAMILY)?.let { start(ctx, it) } ?: false

    fun openHome(ctx: Context) {
        start(ctx, Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    }
}
