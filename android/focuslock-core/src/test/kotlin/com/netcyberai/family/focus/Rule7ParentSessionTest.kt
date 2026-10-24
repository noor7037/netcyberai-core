package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rule 7: the parent PIN opens a parent session. It re-locks by itself after the time the parent sets
// (30 minutes by default) or when the screen turns off.
class Rule7ParentSessionTest {
    private val notDone = stateWith(status(MONDAY, child(done = false)))
    private val minute = 60_000L

    @Test
    fun thePinOpensEverythingForAParentSession() {
        val entry = FocusEngine.enterParentPin(notDone, rules(), "482916", trusted(MON_5PM))
        assertEquals(PinResult.Ok, entry.result)
        assertEquals(Decision.Open(OpenReason.PARENT_SESSION), FocusEngine.decide(YOUTUBE, rules(), DEVICE, entry.state, trusted(MON_5PM)))
        assertEquals(Decision.Open(OpenReason.PARENT_SESSION), FocusEngine.decide("com.android.settings", rules(), DEVICE, entry.state, trusted(MON_5PM)))
    }

    @Test
    fun itReLocksByItselfAfterThirtyMinutesByDefault() {
        val state = FocusEngine.enterParentPin(notDone, rules(), "482916", trusted(MON_5PM)).state
        assertTrue(FocusEngine.isParentSessionActive(state, trusted(MON_5PM + 30 * minute - 1)))
        assertFalse(FocusEngine.isParentSessionActive(state, trusted(MON_5PM + 30 * minute)))
        assertTrue(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, trusted(MON_5PM + 30 * minute)) is Decision.Blocked)
    }

    @Test
    fun theParentSetsTheSessionLength() {
        val r = rules(parentSessionMinutes = 10)
        val state = FocusEngine.enterParentPin(notDone, r, "482916", trusted(MON_5PM)).state
        assertTrue(FocusEngine.isParentSessionActive(state, trusted(MON_5PM + 10 * minute - 1)))
        assertFalse(FocusEngine.isParentSessionActive(state, trusted(MON_5PM + 10 * minute)))
        assertTrue(RuleProblem.BAD_PARENT_SESSION in rules(parentSessionMinutes = 241).problems(DEVICE))
    }

    @Test
    fun itReLocksWhenTheScreenTurnsOff() {
        val state = FocusEngine.enterParentPin(notDone, rules(), "482916", trusted(MON_5PM)).state
        val off = FocusEngine.onScreenOff(state)
        assertFalse(FocusEngine.isParentSessionActive(off, trusted(MON_5PM + minute)))
        assertTrue(FocusEngine.decide(YOUTUBE, rules(), DEVICE, off, trusted(MON_5PM + minute)) is Decision.Blocked)
    }

    @Test
    fun theParentCanLockAgainAtOnce() {
        val state = FocusEngine.enterParentPin(notDone, rules(), "482916", trusted(MON_5PM)).state
        assertFalse(FocusEngine.isParentSessionActive(FocusEngine.endParentSession(state), trusted(MON_5PM)))
    }

    @Test
    fun aWrongPinOpensNothing() {
        val entry = FocusEngine.enterParentPin(notDone, rules(), "111112", trusted(MON_5PM))
        assertEquals(PinResult.Wrong, entry.result)
        assertFalse(FocusEngine.isParentSessionActive(entry.state, trusted(MON_5PM)))
    }

    @Test
    fun aSessionDoesNotRunBackwardsInTime() {
        val state = FocusEngine.enterParentPin(notDone, rules(), "482916", trusted(MON_5PM)).state
        assertFalse(FocusEngine.isParentSessionActive(state, trusted(MON_5PM - 1)))
    }

    @Test
    fun aPinResetEndsAnOpenSession() {
        val state = FocusEngine.enterParentPin(notDone, rules(), "482916", trusted(MON_5PM)).state
        val reset = FocusEngine.applyStatus(state, status(MONDAY, child(done = false), pinVersion = "v2"))
        assertFalse(FocusEngine.isParentSessionActive(reset, trusted(MON_5PM + minute)))
        // A reply with the same PIN version keeps it.
        val same = FocusEngine.applyStatus(state, status(MONDAY, child(done = false), pinVersion = "v1"))
        assertTrue(FocusEngine.isParentSessionActive(same, trusted(MON_5PM + minute)))
    }
}
