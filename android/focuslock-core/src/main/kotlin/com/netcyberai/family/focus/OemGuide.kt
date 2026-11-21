package com.netcyberai.family.focus

// The phone brand's own set-up steps for the lock (C538; docs/34 §9.2 "per brand, a guided step to allow autostart and
// switch off battery saving"), for the ten brand families pilot families use. Budget brands stop background apps unless
// the parent allows them; without these steps the lock stops quietly.
// - Each step lists the brand's own screens to try, in order; the app opens the first one the phone has, and else our
//   app's own App info page (every Android phone has it), with the words saying where to tap there.
// - The screen names are the brands' own and change between versions, so every one is checked on a real phone before
//   the public listing (M2b-8); a missing one only falls back to App info, never fails.
// - securityApps: the brands' own security, battery, installer and app-store apps. In lock times they need the parent
//   PIN, like Settings and the Play Store (rule 8), because each can switch off a permission, stop the lock or remove it.

enum class Brand { XIAOMI, SAMSUNG, VIVO, REALME, OPPO, ONEPLUS, MOTOROLA, PIXEL, NOTHING, TRANSSION, OTHER }

enum class StepKind {
    /** Let the app start by itself after a restart (the brand's "Autostart" / "Auto launch" / "Background start"). */
    AUTOSTART,

    /** No battery restriction for the app ("Unrestricted" / "No restrictions" / "Allow background activity"). */
    BATTERY,

    /** Xiaomi only: "Display pop-up windows while running in the background", without which the block screen cannot show. */
    BACKGROUND_POPUP,
}

/** A brand's screen: its package, its activity (null: the package's own start screen) and the extras it reads. */
data class OemScreen(val pkg: String, val cls: String?, val extras: Map<String, String> = emptyMap())

/** One step: the screens to try in order, and whether the phone can tell us it is done (battery can; the rest cannot). */
data class OemStep(val kind: StepKind, val screens: List<OemScreen>, val checkable: Boolean)

object OemGuide {
    /** Our own package name, put into a screen's extras where the brand's screen needs it. */
    const val SELF = "\$self"

    fun brandOf(manufacturer: String, brand: String): Brand {
        val m = "${manufacturer.lowercase()} ${brand.lowercase()}"
        return when {
            listOf("xiaomi", "redmi", "poco").any { it in m } -> Brand.XIAOMI
            "samsung" in m -> Brand.SAMSUNG
            "vivo" in m || "iqoo" in m -> Brand.VIVO
            "realme" in m -> Brand.REALME
            "oneplus" in m -> Brand.ONEPLUS
            "oppo" in m -> Brand.OPPO
            "motorola" in m || "moto" in m -> Brand.MOTOROLA
            "google" in m -> Brand.PIXEL
            "nothing" in m || "cmf" in m -> Brand.NOTHING
            listOf("infinix", "tecno", "itel", "transsion").any { it in m } -> Brand.TRANSSION
            else -> Brand.OTHER
        }
    }

    private val COLOROS_AUTOSTART = listOf(
        OemScreen("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        OemScreen("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
        OemScreen("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
        OemScreen("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
    )

    /** The battery step for every brand: the brand's own screen where there is one, then App info → Battery. */
    private val APP_INFO_BATTERY = OemStep(StepKind.BATTERY, emptyList(), checkable = true)

    fun steps(brand: Brand): List<OemStep> = when (brand) {
        Brand.XIAOMI -> listOf(
            OemStep(StepKind.AUTOSTART, listOf(OemScreen("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")), checkable = false),
            OemStep(
                StepKind.BACKGROUND_POPUP,
                listOf(
                    OemScreen("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity", mapOf("extra_pkgname" to SELF)),
                    OemScreen("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity", mapOf("extra_pkgname" to SELF)),
                ),
                checkable = false,
            ),
            OemStep(
                StepKind.BATTERY,
                listOf(OemScreen("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity", mapOf("package_name" to SELF, "package_label" to "NetCyberAI Focus"))),
                checkable = true,
            ),
        )
        Brand.VIVO -> listOf(
            OemStep(
                StepKind.AUTOSTART,
                listOf(
                    OemScreen("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
                    OemScreen("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
                    OemScreen("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
                ),
                checkable = false,
            ),
            APP_INFO_BATTERY,
        )
        Brand.OPPO, Brand.REALME -> listOf(OemStep(StepKind.AUTOSTART, COLOROS_AUTOSTART, checkable = false), APP_INFO_BATTERY)
        Brand.ONEPLUS -> listOf(
            OemStep(StepKind.AUTOSTART, listOf(OemScreen("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")) + COLOROS_AUTOSTART, checkable = false),
            APP_INFO_BATTERY,
        )
        Brand.TRANSSION -> listOf(
            OemStep(StepKind.AUTOSTART, listOf(OemScreen("com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity")), checkable = false),
            APP_INFO_BATTERY,
        )
        // Samsung, Motorola, Pixel, Nothing and others: no autostart switch; App info → Battery → Unrestricted.
        Brand.SAMSUNG, Brand.MOTOROLA, Brand.PIXEL, Brand.NOTHING, Brand.OTHER -> listOf(APP_INFO_BATTERY)
    }

    val securityApps: Set<String> = setOf(
        // Xiaomi, Redmi, POCO
        "com.miui.securitycenter", "com.miui.powerkeeper", "com.miui.packageinstaller", "com.miui.cleaner", "com.xiaomi.market",
        "com.xiaomi.mipicks",
        // Samsung
        "com.samsung.android.lool", "com.samsung.android.sm", "com.samsung.android.sm.devicesecurity", "com.sec.android.app.samsungapps",
        // Vivo, iQOO
        "com.iqoo.secure", "com.vivo.permissionmanager", "com.vivo.appstore",
        // Oppo, Realme, OnePlus
        "com.coloros.safecenter", "com.oplus.safecenter", "com.oppo.safe", "com.coloros.phonemanager", "com.oplus.phonemanager",
        "com.oneplus.security", "com.heytap.market", "com.oppo.market",
        // Infinix, Tecno, itel
        "com.transsion.phonemaster", "com.transsion.packageinstaller",
    )
}
