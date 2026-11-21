package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The NetCyberAI Focus app's own rules (C538): what it may send, which apps it ticks for the parent, and the brand
// set-up steps for the ten brand families pilot families use.
class FocusOutboundTest {
    @Test
    fun oneHostFourRequestsAndNothingElse() {
        val urls = FocusOutbound.Endpoint.entries.map { FocusOutbound.url(it) }
        assertEquals(4, urls.size)
        for (u in urls) assertTrue(u, u.startsWith("https://www.netcyberai.com/api/family/"))
        assertEquals(
            setOf("POST /api/family/focus/redeem", "GET /api/family/focus/status", "POST /api/family/focus/heartbeat", "POST /api/family/pin/unlock"),
            FocusOutbound.Endpoint.entries.map { "${it.method} ${it.path}" }.toSet(),
        )
    }

    @Test
    fun theHeartbeatCarriesExactlyThreeFlags() {
        val body = FocusOutbound.heartbeatBody(lockOn = true, permissionsOk = false, clockChanged = true)
        assertEquals("{\"lockOn\":true,\"permissionsOk\":false,\"clockChanged\":true}", body)
        assertEquals(3, Regex("\"[a-zA-Z]+\":").findAll(body).count())
    }

    @Test
    fun bodiesCarryOnlyAPassOrAPin() {
        assertNull(FocusOutbound.redeemBody("abc\",\"app\":\"com.google.android.youtube"))
        assertNull(FocusOutbound.redeemBody("short"))
        assertEquals("{\"pass\":\"aaaaaaaaaa.bbbbbbbbbb.cccccccccc\"}", FocusOutbound.redeemBody("aaaaaaaaaa.bbbbbbbbbb.cccccccccc"))
        assertNull(FocusOutbound.pinBody("12345"))
        assertNull(FocusOutbound.pinBody("12345a"))
        assertEquals("{\"pin\":\"482915\"}", FocusOutbound.pinBody("482915"))
        assertTrue(FocusOutbound.isDeviceId("A".repeat(43)))
        assertFalse(FocusOutbound.isDeviceId("short"))
    }
}

class AppSuggestTest {
    @Test
    fun gamesVideoSocialBrowsersAndKnownAppsAreTicked() {
        assertTrue(AppSuggest.suggested("com.example.racing", AppSuggest.CATEGORY_GAME, opensWebPages = false))
        assertTrue(AppSuggest.suggested("com.example.tube", AppSuggest.CATEGORY_VIDEO, opensWebPages = false))
        assertTrue(AppSuggest.suggested("com.example.chat", AppSuggest.CATEGORY_SOCIAL, opensWebPages = false))
        // A browser: otherwise a child opens m.youtube.com in it.
        assertTrue(AppSuggest.suggested("com.android.chrome", -1, opensWebPages = true))
        assertTrue(AppSuggest.suggested("com.google.android.youtube", -1, opensWebPages = false))
        assertTrue(AppSuggest.suggested("in.mohalla.sharechat", -1, opensWebPages = false))
    }

    @Test
    fun whatsappOurAppsAndOrdinaryAppsAreNot() {
        for (p in listOf("com.whatsapp", "com.whatsapp.w4b", "com.netcyberai.family", "com.netcyberai.focus")) {
            assertFalse(p, AppSuggest.suggested(p, AppSuggest.CATEGORY_SOCIAL, opensWebPages = true))
        }
        assertFalse(AppSuggest.suggested("com.example.calculator", 7, opensWebPages = false))
        assertFalse(AppSuggest.suggested("com.example.camera", -1, opensWebPages = false))
    }
}

class OemGuideTest {
    @Test
    fun theTenBrandFamiliesAreRecognised() {
        val cases = mapOf(
            ("Xiaomi" to "Redmi") to Brand.XIAOMI, ("Xiaomi" to "POCO") to Brand.XIAOMI, ("samsung" to "samsung") to Brand.SAMSUNG,
            ("vivo" to "vivo") to Brand.VIVO, ("vivo" to "iQOO") to Brand.VIVO, ("realme" to "realme") to Brand.REALME,
            ("OPPO" to "OPPO") to Brand.OPPO, ("OnePlus" to "OnePlus") to Brand.ONEPLUS, ("motorola" to "motorola") to Brand.MOTOROLA,
            ("Google" to "google") to Brand.PIXEL, ("Nothing" to "Nothing") to Brand.NOTHING, ("CMF" to "CMF") to Brand.NOTHING,
            ("INFINIX MOBILITY LIMITED" to "Infinix") to Brand.TRANSSION, ("TECNO MOBILE LIMITED" to "TECNO") to Brand.TRANSSION,
            ("itel" to "itel") to Brand.TRANSSION, ("Lava" to "lava") to Brand.OTHER,
        )
        for ((k, v) in cases) assertEquals("$k", v, OemGuide.brandOf(k.first, k.second))
    }

    @Test
    fun everyBrandHasABatteryStepAndTheBudgetBrandsAnAutostartStep() {
        for (b in Brand.entries) {
            val kinds = OemGuide.steps(b).map { it.kind }
            assertTrue("$b", StepKind.BATTERY in kinds)
            assertEquals("$b", kinds.size, kinds.toSet().size)
        }
        for (b in listOf(Brand.XIAOMI, Brand.VIVO, Brand.REALME, Brand.OPPO, Brand.ONEPLUS, Brand.TRANSSION)) {
            assertTrue("$b", StepKind.AUTOSTART in OemGuide.steps(b).map { it.kind })
        }
        assertEquals(listOf(StepKind.AUTOSTART, StepKind.BACKGROUND_POPUP, StepKind.BATTERY), OemGuide.steps(Brand.XIAOMI).map { it.kind })
        for (b in listOf(Brand.SAMSUNG, Brand.MOTOROLA, Brand.PIXEL, Brand.NOTHING)) assertEquals(listOf(StepKind.BATTERY), OemGuide.steps(b).map { it.kind })
        // Only the battery step can be read back from the phone; the parent confirms the others.
        for (b in Brand.entries) for (s in OemGuide.steps(b)) assertEquals(s.kind == StepKind.BATTERY, s.checkable)
    }

    @Test
    fun theBrandsSecurityAppsNeedThePinAndNeverIncludeCallingApps() {
        assertTrue("com.miui.securitycenter" in OemGuide.securityApps)
        assertTrue("com.miui.packageinstaller" in OemGuide.securityApps)
        assertTrue("com.transsion.phonemaster" in OemGuide.securityApps)
        assertTrue(OemGuide.securityApps.none { it in DevicePackages.DEFAULT_ALWAYS_OPEN || it in DevicePackages.WHATSAPP })
    }
}
