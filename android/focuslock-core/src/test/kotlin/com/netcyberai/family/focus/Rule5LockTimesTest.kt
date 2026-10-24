package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rule 5: only the apps the parent picks are locked, and only at the lock times the parent sets, by weekday
// (for example weekdays 4-9 pm). Our own app, and educational apps the parent marks, stay open.
class Rule5LockTimesTest {
    private val notDone = stateWith(status(MONDAY, child(done = false)))
    private fun at(millis: Long, r: FocusRules = rules(), pkg: String = YOUTUBE) = FocusEngine.decide(pkg, r, DEVICE, notDone, trusted(millis))

    @Test
    fun weekdaysFourToNine() {
        assertTrue(at(ist(2026, 10, 26, 16, 0)) is Decision.Blocked) // Monday 4:00 pm, the start is included
        assertTrue(at(ist(2026, 10, 26, 20, 59)) is Decision.Blocked)
        assertTrue(at(ist(2026, 10, 30, 18, 0)) is Decision.Blocked) // Friday
        assertEquals(Decision.Open(OpenReason.OUTSIDE_LOCK_TIME), at(ist(2026, 10, 26, 15, 59)))
        assertEquals(Decision.Open(OpenReason.OUTSIDE_LOCK_TIME), at(ist(2026, 10, 26, 21, 0))) // the end is excluded
        assertEquals(Decision.Open(OpenReason.OUTSIDE_LOCK_TIME), at(SAT_5PM)) // the weekend is not chosen
        assertEquals(Decision.Open(OpenReason.OUTSIDE_LOCK_TIME), at(ist(2026, 11, 1, 17, 0))) // Sunday
    }

    @Test
    fun differentTimesOnDifferentDaysAndSeveralWindowsADay() {
        val r = rules(
            windows = listOf(
                LockWindow.at(LockWindow.WEEKDAYS, 7, 0, 8, 30),
                LockWindow.at(LockWindow.WEEKDAYS, 16, 0, 21, 0),
                LockWindow.at(LockWindow.WEEKEND, 10, 0, 13, 0),
            ),
        )
        assertTrue(at(ist(2026, 10, 26, 7, 45), r) is Decision.Blocked)
        assertTrue(at(ist(2026, 10, 26, 12, 0), r) is Decision.Open)
        assertTrue(at(ist(2026, 10, 31, 11, 0), r) is Decision.Blocked) // Saturday morning
        assertTrue(at(SAT_5PM, r) is Decision.Open)
    }

    @Test
    fun aNightLockIsTwoWindowsAcrossMidnight() {
        val r = rules(
            windows = listOf(
                LockWindow.at(LockWindow.EVERY_DAY, 21, 0, 24, 0),
                LockWindow.at(LockWindow.EVERY_DAY, 0, 0, 7, 0),
            ),
        )
        assertTrue(at(ist(2026, 10, 26, 23, 59), r) is Decision.Blocked)
        assertTrue(at(ist(2026, 10, 27, 0, 0), r) is Decision.Blocked)
        assertTrue(at(ist(2026, 10, 27, 6, 59), r) is Decision.Blocked)
        assertTrue(at(ist(2026, 10, 27, 7, 0), r) is Decision.Open)
    }

    @Test
    fun lockTimesAreIndiaTimesWhateverThePhonesTimeZone() {
        // The engine works on epoch time and India's fixed offset, so a phone set to another time zone gains nothing:
        // 10:30 UTC on Monday is 4 pm in India.
        assertTrue(at(java.time.Instant.parse("2026-10-26T10:30:00Z").toEpochMilli()) is Decision.Blocked)
    }

    @Test
    fun onlyTheChosenAppsAreLocked() {
        assertEquals(Decision.Open(OpenReason.NOT_CHOSEN), at(MON_5PM, pkg = CALCULATOR))
        assertTrue(at(MON_5PM, pkg = GAME) is Decision.Blocked)
    }

    @Test
    fun ourOwnAppAndEducationalAppsStayOpen() {
        assertEquals(Decision.Open(OpenReason.OWN_APP), at(MON_5PM, pkg = DevicePackages.OWN_PACKAGE))
        assertEquals(Decision.Open(OpenReason.EDUCATIONAL), at(MON_5PM, pkg = KHAN))
        // Marked educational and chosen by mistake: the parent's educational mark wins, and set-up flags the mix-up.
        val r = rules(lockedApps = setOf(YOUTUBE, KHAN))
        assertEquals(Decision.Open(OpenReason.EDUCATIONAL), at(MON_5PM, r, KHAN))
        assertTrue(RuleProblem.LOCKED_AND_EDUCATIONAL in r.problems(DEVICE))
        // Our own app cannot be chosen.
        assertTrue(RuleProblem.CANNOT_LOCK in rules(lockedApps = setOf(DevicePackages.OWN_PACKAGE)).problems(DEVICE))
    }

    @Test
    fun lockWindowsMustBeRealTimes() {
        assertTrue(LockWindow.at(LockWindow.WEEKDAYS, 16, 0, 21, 0).isValid)
        assertTrue(LockWindow(LockWindow.EVERY_DAY, 0, MINUTES_PER_DAY).isValid)
        for (bad in listOf(
            LockWindow(emptySet(), 960, 1260),
            LockWindow(setOf(0), 960, 1260),
            LockWindow(setOf(8), 960, 1260),
            LockWindow(LockWindow.WEEKDAYS, 1260, 960),
            LockWindow(LockWindow.WEEKDAYS, 960, 960),
            LockWindow(LockWindow.WEEKDAYS, -1, 960),
            LockWindow(LockWindow.WEEKDAYS, 960, MINUTES_PER_DAY + 1),
        )) {
            assertFalse(bad.toString(), bad.isValid)
            assertTrue(RuleProblem.BAD_LOCK_TIME in rules(windows = listOf(bad)).problems(DEVICE))
            // A broken window locks nothing rather than everything.
            assertFalse(bad.covers(IndiaTime.at(MON_5PM)))
        }
        assertEquals(emptySet<RuleProblem>(), rules().problems(DEVICE))
    }
}
