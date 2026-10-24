package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rule 2 and C304: apps unlock only when the server says today's plan is done (from checked answers);
// they then stay open for the rest of that day's lock times, even offline, up to a limit the parent may set. The day
// is the server's India date, never the phone's clock.
class Rule2DoneForTheDayTest {
    private fun decide(state: FocusState, clock: ClockReading, r: FocusRules = rules()) = FocusEngine.decide(YOUTUBE, r, DEVICE, state, clock)

    @Test
    fun aChosenAppIsLockedUntilTheServerSaysDone() {
        val state = stateWith(status(MONDAY, child(done = false)))
        assertTrue(decide(state, trusted(MON_5PM)) is Decision.Blocked)
    }

    @Test
    fun doneFromTheServerOpensTheChosenApps() {
        val state = stateWith(status(MONDAY, child(done = true)))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), decide(state, trusted(MON_5PM)))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), FocusEngine.decide(GAME, rules(), DEVICE, state, trusted(MON_5PM)))
    }

    @Test
    fun doneSticksForTheRestOfTheDayEvenIfALaterReplySaysOtherwise() {
        var state = stateWith(status(MONDAY, child(done = true)))
        state = FocusEngine.applyStatus(state, status(MONDAY, child(done = false)))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), decide(state, trusted(ist(2026, 10, 26, 20, 59))))
    }

    @Test
    fun doneSticksOfflineWithNoFurtherReply() {
        // Done at 5 pm, then no network: still open at 8:59 pm the same day, on the anchored clock.
        val state = stateWith(status(MONDAY, child(done = true)))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), decide(state, trusted(ist(2026, 10, 26, 20, 59))))
    }

    @Test
    fun theNextIndiaDayLocksAgain() {
        val state = stateWith(status(MONDAY, child(done = true)))
        val decision = decide(state, trusted(TUE_5PM))
        assertTrue(decision is Decision.Blocked)
        assertEquals(BlockReason.PLAN_NOT_DONE, (decision as Decision.Blocked).reason)
    }

    @Test
    fun theDayTurnsAtIndiaMidnight() {
        // A window to midnight on Monday and from midnight on Tuesday; done on Monday ends at 00:00 India time.
        val r = rules(windows = listOf(LockWindow(LockWindow.EVERY_DAY, 0, MINUTES_PER_DAY)))
        val state = stateWith(status(MONDAY, child(done = true)))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), decide(state, trusted(ist(2026, 10, 26, 23, 59)), r))
        assertTrue(decide(state, trusted(ist(2026, 10, 27, 0, 0)), r) is Decision.Blocked)
    }

    @Test
    fun theDayComesFromTheServerNotThePhoneClock() {
        // Done on Monday, as the server said. A reading that is not anchored to the server (after a restart, before the
        // next reply) does not confirm done, even when it falls on Monday: the phone's clock could have been set back.
        val state = stateWith(status(MONDAY, child(done = true)))
        assertTrue(decide(state, untrusted(MON_5PM)) is Decision.Blocked)
        // The next status reply anchors the clock again, and done holds.
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), decide(state, trusted(MON_5PM)))
    }

    @Test
    fun theServerIsTheOnlySourceOfDone() {
        // A reply for a different child, or for an earlier day, does not make this child done today.
        val other = stateWith(status(MONDAY, child(id = "c1", done = false)))
        assertFalse(FocusEngine.isDoneToday(other, "c1", trusted(MON_5PM)))
        val yesterday = stateWith(status(date("2026-10-25"), child(done = true)))
        assertTrue(decide(yesterday, trusted(MON_5PM)) is Decision.Blocked)
    }

    @Test
    fun anOlderReplyIsIgnored() {
        var state = stateWith(status(TUESDAY, child(done = false), pinVersion = "v1"))
        state = FocusEngine.applyStatus(state, status(MONDAY, child(done = true)))
        assertEquals(TUESDAY, state.status!!.indiaDate)
        assertTrue(state.doneOn.isEmpty())
    }

    @Test
    fun earlierDaysAndRemovedChildrenAreForgotten() {
        var state = stateWith(status(MONDAY, child(id = "c1", done = true), child(id = "c2", done = true)))
        state = FocusEngine.applyStatus(state, status(TUESDAY, child(id = "c1", done = false)))
        assertTrue(state.doneOn.isEmpty())
    }

    @Test
    fun theParentsLimitAfterDoneCountsMinutesOfUse() {
        val r = rules(doneLimitMinutes = 60)
        var state = stateWith(status(MONDAY, child(done = true)))
        val open = decide(state, trusted(MON_5PM), r)
        assertEquals(Decision.Open(OpenReason.PLAN_DONE, limitChildId = "c1"), open)

        state = FocusEngine.recordLockedUse(state, "c1", 59 * 60_000L, trusted(MON_5PM))
        assertTrue(decide(state, trusted(MON_5PM), r) is Decision.Open)
        state = FocusEngine.recordLockedUse(state, "c1", 60_000L, trusted(MON_5PM))
        assertEquals(Decision.Blocked(BlockReason.DONE_LIMIT_REACHED, childId = "c1"), decide(state, trusted(ist(2026, 10, 26, 18, 30)), r))

        // Apps not chosen, and our own app, are not affected by the limit.
        assertEquals(Decision.Open(OpenReason.NOT_CHOSEN), FocusEngine.decide(CALCULATOR, r, DEVICE, state, trusted(MON_5PM)))
    }

    @Test
    fun theLimitStartsAgainTheNextDay() {
        val r = rules(doneLimitMinutes = 30)
        var state = stateWith(status(MONDAY, child(done = true)))
        state = FocusEngine.recordLockedUse(state, "c1", 30 * 60_000L, trusted(MON_5PM))
        assertEquals(30 * 60_000L, FocusEngine.usedToday(state, "c1", MONDAY))
        state = FocusEngine.applyStatus(state, status(TUESDAY, child(done = true)))
        assertEquals(0L, FocusEngine.usedToday(state, "c1", TUESDAY))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE, limitChildId = "c1"), decide(state, trusted(TUE_5PM), r))
        state = FocusEngine.recordLockedUse(state, "c1", 60_000L, trusted(TUE_5PM))
        assertEquals(60_000L, FocusEngine.usedToday(state, "c1", TUESDAY))
    }

    @Test
    fun noLimitMeansOpenForTheWholeDay() {
        var state = stateWith(status(MONDAY, child(done = true)))
        state = FocusEngine.recordLockedUse(state, "c1", 10 * 3_600_000L, trusted(MON_5PM))
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), decide(state, trusted(ist(2026, 10, 26, 20, 0))))
    }
}
