package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rules 3 and 6: a locked app opened too early shows our screen with the chapters, topics and checks still
// pending, and a button straight to the next one. On a shared phone with more than one child it asks "Who is using the
// phone?" first, for that session only (C304).
class Rule3And6BlockScreenTest {
    private fun blocked(d: Decision) = d as Decision.Blocked

    @Test
    fun theBlockScreenListsWhatIsPendingWithTheNextOneFirst() {
        val state = stateWith(status(MONDAY, child(pending = PENDING)))
        val d = blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, trusted(MON_5PM)))
        assertEquals(BlockReason.PLAN_NOT_DONE, d.reason)
        assertEquals("c1", d.childId)
        assertEquals(PENDING, d.pending)
        assertEquals(PendingItem("ch-fractions", "Fractions: check 2"), d.next)
        assertTrue(d.pendingIsCurrent)
    }

    @Test
    fun theListFollowsTheLatestReply() {
        var state = stateWith(status(MONDAY, child(pending = PENDING)))
        state = FocusEngine.applyStatus(state, status(MONDAY, child(pending = PENDING.drop(1))))
        val d = blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, trusted(MON_5PM)))
        assertEquals(PendingItem("en-unit-3", "English unit 3"), d.next)
    }

    @Test
    fun yesterdaysListIsNotShownAsToday() {
        // Offline since Monday: on Tuesday the screen asks to connect instead of showing Monday's list.
        val state = stateWith(status(MONDAY, child(pending = PENDING)))
        val d = blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, trusted(TUE_5PM)))
        assertEquals(BlockReason.PLAN_NOT_DONE, d.reason)
        assertTrue(d.pending.isEmpty())
        assertNull(d.next)
        assertFalse(d.pendingIsCurrent)
    }

    @Test
    fun beforeAnyReplyTheAppStaysLocked() {
        val d = blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, stateWith(null), trusted(MON_5PM)))
        assertEquals(BlockReason.PLAN_NOT_DONE, d.reason)
        assertFalse(d.pendingIsCurrent)
    }

    @Test
    fun aSharedPhoneAsksWhoIsUsingIt() {
        val state = stateWith(status(MONDAY, child(id = "c1", name = "Asha"), child(id = "c2", name = "Ravi", done = true)))
        val d = blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, state, trusted(MON_5PM)))
        assertEquals(BlockReason.CHOOSE_CHILD, d.reason)
        assertEquals(listOf(ChildChoice("c1", "Asha"), ChildChoice("c2", "Ravi")), d.children)
    }

    @Test
    fun theChosenChildsPlanDecidesForThatSessionOnly() {
        val state = stateWith(status(MONDAY, child(id = "c1", name = "Asha"), child(id = "c2", name = "Ravi", done = true)))

        val ravi = FocusEngine.chooseChild(state, "c2")
        assertEquals(Decision.Open(OpenReason.PLAN_DONE), FocusEngine.decide(YOUTUBE, rules(), DEVICE, ravi, trusted(MON_5PM)))

        val asha = FocusEngine.chooseChild(state, "c1")
        val d = blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, asha, trusted(MON_5PM)))
        assertEquals("c1", d.childId)
        assertEquals(PENDING, d.pending)

        // The screen turns off: the next child is asked again.
        val off = FocusEngine.onScreenOff(ravi)
        assertEquals(BlockReason.CHOOSE_CHILD, blocked(FocusEngine.decide(YOUTUBE, rules(), DEVICE, off, trusted(MON_5PM))).reason)
    }

    @Test
    fun aChildNotSetForThisPhoneCannotBeChosen() {
        val state = stateWith(status(MONDAY, child(id = "c1"), child(id = "c2")))
        assertNull(FocusEngine.chooseChild(state, "c9").childInUse)
        // A child removed from the phone by a later reply is no longer the one in use.
        val chosen = FocusEngine.chooseChild(state, "c2")
        assertNull(FocusEngine.applyStatus(chosen, status(MONDAY, child(id = "c1"), child(id = "c3"))).childInUse)
    }
}
