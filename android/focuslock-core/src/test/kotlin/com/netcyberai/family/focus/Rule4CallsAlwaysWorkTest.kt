package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rule 4: the dialler, contacts, messages and emergency calls are never locked. The parent chooses at
// set-up whether WhatsApp stays open.
class Rule4CallsAlwaysWorkTest {
    private val notDone = stateWith(status(MONDAY, child(done = false)))

    @Test
    fun callingAppsAreOpenInLockTimesWithThePlanNotDone() {
        for (pkg in listOf(
            "com.android.dialer", "com.google.android.dialer", "com.android.contacts", "com.google.android.contacts",
            "com.android.mms", "com.google.android.apps.messaging", "com.android.phone", "com.android.server.telecom",
            "com.android.emergency", "com.android.systemui",
        )) {
            assertEquals(pkg, Decision.Open(OpenReason.ALWAYS_OPEN), FocusEngine.decide(pkg, rules(), DEVICE, notDone, trusted(MON_5PM)))
        }
    }

    @Test
    fun theCallingAppsStayOpenEvenIfTheParentChoseThem() {
        val r = rules(lockedApps = setOf(YOUTUBE, "com.google.android.dialer"))
        assertEquals(Decision.Open(OpenReason.ALWAYS_OPEN), FocusEngine.decide("com.google.android.dialer", r, DEVICE, notDone, trusted(MON_5PM)))
        assertTrue(RuleProblem.CANNOT_LOCK in r.problems(DEVICE))
    }

    @Test
    fun thePhonesOwnDiallerAndMessagesAppsFromTheirBrandAreOpenToo() {
        // The plugin adds the phone's default apps at run time (they differ by brand).
        val samsung = DevicePackages(alwaysOpen = DevicePackages.DEFAULT_ALWAYS_OPEN + setOf("com.samsung.android.dialer", "com.samsung.android.messaging"))
        val r = rules(lockedApps = setOf(YOUTUBE, "com.samsung.android.messaging"))
        assertEquals(Decision.Open(OpenReason.ALWAYS_OPEN), FocusEngine.decide("com.samsung.android.messaging", r, samsung, notDone, trusted(MON_5PM)))
        assertTrue(RuleProblem.CANNOT_LOCK in r.problems(samsung))
    }

    @Test
    fun whatsAppStaysOpenWhenTheParentChoseSo() {
        val r = rules(whatsappOpen = true, lockedApps = setOf(YOUTUBE, "com.whatsapp"))
        for (pkg in DevicePackages.WHATSAPP) {
            assertEquals(pkg, Decision.Open(OpenReason.WHATSAPP_CHOSEN_OPEN), FocusEngine.decide(pkg, r, DEVICE, notDone, trusted(MON_5PM)))
        }
    }

    @Test
    fun whatsAppIsLockedWhenTheParentChoseToLockIt() {
        val r = rules(whatsappOpen = false, lockedApps = setOf(YOUTUBE, "com.whatsapp", "com.whatsapp.w4b"))
        for (pkg in DevicePackages.WHATSAPP) {
            assertTrue(pkg, FocusEngine.decide(pkg, r, DEVICE, notDone, trusted(MON_5PM)) is Decision.Blocked)
        }
        // Not chosen and not kept open: like any app the parent did not choose, it is not locked.
        assertEquals(Decision.Open(OpenReason.NOT_CHOSEN), FocusEngine.decide("com.whatsapp", rules(whatsappOpen = false), DEVICE, notDone, trusted(MON_5PM)))
    }
}
