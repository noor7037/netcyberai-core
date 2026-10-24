package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rule 8: escalating waits after 5 wrong PINs, no hints, the PIN never shown; Settings and the Play Store
// (and the installer, so uninstalling needs the PIN) locked in lock times; a changed clock detected for the tamper
// report. Revoked permissions, a force-stop and safe mode are seen on the phone and reported by M2b-6.
class Rule8NoBypassTest {
    private val minute = 60_000L
    private val pin = "482916"
    private val wrong = "111112"

    @Test
    fun fiveWrongPinsThenWaitsOfOneFiveFifteenThenSixtyMinutes() {
        var s = pinState(pin)
        var t = MON_5PM
        fun attempt(p: String): PinResult {
            val c = PinGuard.check(s, p, "v1", t)
            s = c.state
            return c.result
        }
        repeat(4) { assertEquals("try ${it + 1}", PinResult.Wrong, attempt(wrong)) }
        assertEquals(PinResult.Wait(1), attempt(wrong)) // the fifth

        for (expected in listOf(5, 15, 60, 60, 60)) {
            t = s.waitUntilMillis
            assertEquals(PinResult.Wait(expected), attempt(wrong))
        }
    }

    @Test
    fun duringAWaitEvenTheRightPinIsNotCheckedOrCounted() {
        var s = pinState(pin)
        repeat(5) { s = PinGuard.check(s, wrong, "v1", MON_5PM).state }
        val failures = s.failures
        val during = PinGuard.check(s, pin, "v1", MON_5PM + 30_000)
        assertEquals(PinResult.Wait(1), during.result)
        assertEquals(failures, during.state.failures)
        val wrongDuring = PinGuard.check(s, wrong, "v1", MON_5PM + 30_000)
        assertEquals(failures, wrongDuring.state.failures)
        // After the wait the right PIN works and the count starts again.
        val after = PinGuard.check(s, pin, "v1", MON_5PM + minute)
        assertEquals(PinResult.Ok, after.result)
        assertEquals(PinState(s.record, 0, 0), after.state)
        assertEquals(PinResult.Wrong, PinGuard.check(after.state, wrong, "v1", MON_5PM + minute).result)
    }

    @Test
    fun theWaitsMatchTheServer() {
        // src/lib/family/pin.ts waitAfter: 0 for 0-4 failures, then 1, 5, 15, 60, 60 ... minutes.
        assertEquals(listOf(0L, 0L, 0L, 0L, 0L, 1L, 5L, 15L, 60L, 60L, 60L), (0..10).map { PinGuard.waitAfter(it) / minute })
    }

    @Test
    fun aWaitIsKeptInLockTimeSoARestartDoesNotClearIt() {
        // Eight wrong tries, each as soon as the wait before it allowed; the last one, at 4:21 pm, brings an hour (to 5:21 pm).
        var s = pinState(pin)
        var t = ist(2026, 10, 26, 16, 0)
        repeat(8) {
            t = maxOf(t, s.waitUntilMillis)
            s = PinGuard.check(s, wrong, "v1", t).state
        }
        assertEquals(8, s.failures)
        assertEquals(ist(2026, 10, 26, 16, 21), t)
        assertEquals(t + 60 * minute, s.waitUntilMillis)
        // After a restart the lock's clock never goes back past what it has seen (TrustedClock), so the wait holds.
        val anchor = ClockAnchor(MON_5PM, 1_000, MON_5PM, "boot-1")
        val afterRestart = TrustedClock.read(anchor, MON_5PM + minute, "boot-2", elapsedMillis = 10, wallMillis = MON_3PM)
        assertTrue(afterRestart.clockChanged)
        assertEquals(MON_5PM + minute, afterRestart.epochMillis)
        assertEquals(PinResult.Wait(20), PinGuard.check(s, pin, "v1", afterRestart.epochMillis).result)
    }

    @Test
    fun noHintsAndThePinIsNeverShown() {
        val s = pinState(pin)
        val c = PinGuard.check(s, "482910", "v1", MON_5PM)
        // A wrong PIN says only "wrong": nothing about which digits, or how close.
        assertEquals(PinResult.Wrong, c.result)
        assertEquals(PinResult.Wrong, PinGuard.check(s, "000000", "v1", MON_5PM).result)
        assertFalse(c.toString().contains(pin))
        assertFalse(c.state.toString().contains(s.record!!.hash))
    }

    @Test
    fun settingsThePlayStoreAndTheInstallerAreLockedInLockTimes() {
        val done = stateWith(status(MONDAY, child(done = true)))
        for (pkg in DevicePackages.DEFAULT_LOCKED_IN_LOCK_TIME) {
            // Even with today's plan done: only the parent PIN opens them in lock times.
            assertEquals(pkg, Decision.Blocked(BlockReason.PIN_REQUIRED), FocusEngine.decide(pkg, rules(), DEVICE, done, trusted(MON_5PM)))
            assertEquals(pkg, Decision.Open(OpenReason.OUTSIDE_LOCK_TIME), FocusEngine.decide(pkg, rules(), DEVICE, done, trusted(MON_3PM)))
        }
        val parent = FocusEngine.enterParentPin(done, rules(), pin, trusted(MON_5PM)).state
        assertEquals(Decision.Open(OpenReason.PARENT_SESSION), FocusEngine.decide("com.android.settings", rules(), DEVICE, parent, trusted(MON_5PM)))
    }

    @Test
    fun markingSettingsEducationalDoesNotOpenIt() {
        val r = rules().copy(educationalApps = setOf(KHAN, "com.android.vending"))
        assertEquals(Decision.Blocked(BlockReason.PIN_REQUIRED), FocusEngine.decide("com.android.vending", r, DEVICE, stateWith(status()), trusted(MON_5PM)))
    }

    @Test
    fun changingThePhonesClockOpensNothing() {
        // At 5 pm on Monday the child moves the phone's clock to 10 pm. The anchored clock still says 5 pm: locked,
        // and the change is flagged for the tamper report.
        val state = stateWith(status(MONDAY, child(done = false)))
        val anchor = ClockAnchor(MON_3PM, 0, MON_3PM, "boot-1")
        val reading = TrustedClock.read(anchor, null, "boot-1", elapsedMillis = 2 * 60 * minute, wallMillis = ist(2026, 10, 26, 22, 0))
        assertTrue(reading.clockChanged)
        assertTrue(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, reading) is Decision.Blocked)
    }

    @Test
    fun changingThePhonesTimeZoneOpensNothing() {
        // The same instant is 5 pm in India whatever zone the phone shows; the engine never reads the phone's zone.
        val state = stateWith(status(MONDAY, child(done = false)))
        assertTrue(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, trusted(MON_5PM)) is Decision.Blocked)
        assertEquals(17 * 60, IndiaTime.at(MON_5PM).minuteOfDay)
    }
}
