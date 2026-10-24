package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The lock's clock: the server's time carried forward by the time since boot (C304; §9.1 rule 8's clock tamper).
class TrustedClockTest {
    private val hour = 3_600_000L

    // The phone's clock was 3 minutes fast when the status reply arrived (a common, harmless error).
    private val anchor = ClockAnchor(serverMillis = MON_3PM, elapsedMillis = 10 * hour, wallMillis = MON_3PM + 180_000, bootId = "boot-7")

    @Test
    fun countsFromTheServerAnchorInTheSameBoot() {
        val r = TrustedClock.read(anchor, null, "boot-7", elapsedMillis = 12 * hour, wallMillis = MON_3PM + 2 * hour + 180_000)
        assertEquals(MON_5PM, r.epochMillis)
        assertTrue(r.trusted)
        assertFalse(r.clockChanged) // a clock that was always 3 minutes fast is not a change
    }

    @Test
    fun aChangedPhoneClockChangesNothingButIsFlagged() {
        // At 5 pm the child sets the phone's clock to 9:30 pm to get past the lock time.
        val r = TrustedClock.read(anchor, null, "boot-7", elapsedMillis = 12 * hour, wallMillis = ist(2026, 10, 26, 21, 30))
        assertEquals(MON_5PM, r.epochMillis)
        assertTrue(r.trusted)
        assertTrue(r.clockChanged)
        // ... or back to yesterday.
        val back = TrustedClock.read(anchor, null, "boot-7", elapsedMillis = 12 * hour, wallMillis = MON_5PM - 24 * hour)
        assertEquals(MON_5PM, back.epochMillis)
        assertTrue(back.clockChanged)
    }

    @Test
    fun smallNetworkTimeCorrectionsAreNotAChange() {
        val r = TrustedClock.read(anchor, null, "boot-7", elapsedMillis = 12 * hour, wallMillis = MON_5PM + 180_000 + 90_000)
        assertFalse(r.clockChanged)
    }

    @Test
    fun aRestartIsSeenByTheBootIdOrByTimeSinceBootGoingBack() {
        val otherBoot = TrustedClock.read(anchor, null, "boot-8", elapsedMillis = 12 * hour, wallMillis = MON_5PM + 180_000)
        assertFalse(otherBoot.trusted)
        val wentBack = TrustedClock.read(anchor, null, "boot-7", elapsedMillis = hour, wallMillis = MON_5PM + 180_000)
        assertFalse(wentBack.trusted)
    }

    @Test
    fun afterARestartThePhoneClockIsUsedCorrectedByItsKnownOffset() {
        val r = TrustedClock.read(anchor, MON_3PM + hour, "boot-8", elapsedMillis = 60_000, wallMillis = MON_5PM + 180_000)
        assertEquals(MON_5PM, r.epochMillis)
        assertFalse(r.trusted)
        assertFalse(r.clockChanged)
    }

    @Test
    fun afterARestartTheClockCannotGoBackPastWhatTheLockHasSeen() {
        // The lock last saw 8 pm. After a restart the phone's clock says 2 pm the same day.
        val floor = ist(2026, 10, 26, 20, 0)
        val r = TrustedClock.read(anchor, floor, "boot-8", elapsedMillis = 60_000, wallMillis = ist(2026, 10, 26, 14, 0) + 180_000)
        assertEquals(floor, r.epochMillis)
        assertFalse(r.trusted)
        assertTrue(r.clockChanged)
    }

    @Test
    fun beforeAnyStatusReplyThePhoneClockIsUntrusted() {
        val r = TrustedClock.read(null, null, "boot-1", elapsedMillis = 5, wallMillis = MON_5PM)
        assertEquals(MON_5PM, r.epochMillis)
        assertFalse(r.trusted)
    }

    @Test
    fun theFloorOnlyRisesExceptThatServerTimeResetsIt() {
        assertEquals(MON_5PM, TrustedClock.nextFloor(MON_3PM, untrusted(MON_5PM)))
        assertEquals(MON_5PM, TrustedClock.nextFloor(MON_5PM, untrusted(MON_3PM)))
        assertEquals(MON_3PM, TrustedClock.nextFloor(MON_5PM, trusted(MON_3PM)))
        assertEquals(MON_3PM, TrustedClock.nextFloor(null, untrusted(MON_3PM)))
    }
}
