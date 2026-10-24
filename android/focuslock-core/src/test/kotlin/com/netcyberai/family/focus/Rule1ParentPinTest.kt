package com.netcyberai.family.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// docs/34 §9.1 rule 1: only the parent sets the PIN. Six digits, stored only as a salted hash, reset only by the parent
// (by email, on the server: a new PIN version). The PIN guards every setting on the phone.
class Rule1ParentPinTest {
    @Test
    fun thePinIsStoredOnlyAsASaltedHash() {
        val a = PinHasher.hash("482916")
        val b = PinHasher.hash("482916")
        assertNotEquals("a fresh salt each time", a, b)
        assertTrue(a.startsWith("pbkdf2-sha256$${PinHasher.ITERATIONS}$"))
        assertFalse("the PIN is not in the stored form", a.contains("482916"))
        assertTrue(PinHasher.matches(a, "482916"))
        assertTrue(PinHasher.matches(b, "482916"))
        assertFalse(PinHasher.matches(a, "482917"))
    }

    @Test
    fun thePinIsSixDigits() {
        assertTrue(PinHasher.isWellFormed("000000"))
        for (bad in listOf("", "12345", "1234567", "12345a", "१२३४५६", " 12345")) assertFalse(bad, PinHasher.isWellFormed(bad))
        val stored = pinState("482916").record!!.hash
        assertFalse(PinHasher.matches(stored, "4829160"))
    }

    @Test
    fun aDamagedStoredHashNeverMatches() {
        val good = pinState("482916").record!!.hash
        val parts = good.split('$')
        val damaged = listOf(
            "", "482916", good.replace("pbkdf2-sha256", "pbkdf2-sha1"), parts.take(3).joinToString("$"),
            listOf(parts[0], "0", parts[2], parts[3]).joinToString("$"),
            listOf(parts[0], parts[1], "zz", parts[3]).joinToString("$"),
            listOf(parts[0], parts[1], parts[2], "").joinToString("$"),
        )
        for (d in damaged) assertFalse(d, PinHasher.matches(d, "482916"))
    }

    @Test
    fun theRecordNeverPrintsItsHash() {
        val record = pinState("482916").record!!
        assertFalse(record.toString().contains(record.hash))
        assertFalse(FocusState(pin = PinState(record)).toString().contains(record.hash))
    }

    @Test
    fun aPinResetOnTheServerMakesThePhoneAskForTheNewPin() {
        // The parent reset the PIN by the email code; the status reply now carries version v2.
        var state = stateWith(status(pinVersion = "v1"), pinState("482916", "v1"))
        state = FocusEngine.applyStatus(state, status(pinVersion = "v2"))
        val entry = FocusEngine.enterParentPin(state, rules(), "482916", trusted(MON_5PM))
        assertEquals("the old PIN no longer opens anything", PinResult.NeedsNewPin, entry.result)
        assertFalse(FocusEngine.isParentSessionActive(entry.state, trusted(MON_5PM)))

        // Once the server confirms the new PIN, the phone keeps its hash and the new version.
        val installed = FocusEngine.installPin(entry.state, rules(), "730519", "v2", trusted(MON_5PM))
        assertEquals("v2", installed.pin.record!!.version)
        val again = FocusEngine.enterParentPin(FocusEngine.endParentSession(installed), rules(), "730519", trusted(MON_5PM))
        assertEquals(PinResult.Ok, again.result)
    }

    @Test
    fun noPinOnThePhoneOpensNothing() {
        val entry = FocusEngine.enterParentPin(FocusState(), rules(), "482916", trusted(MON_5PM))
        assertEquals(PinResult.NoPin, entry.result)
        assertFalse(FocusEngine.isParentSessionActive(entry.state, trusted(MON_5PM)))
    }

    @Test
    fun everySettingNeedsTheParentPin() {
        val state = stateWith(status())
        val proposed = rules(lockedApps = setOf(GAME))
        assertEquals(RulesChange.NeedsParentPin, FocusEngine.changeRules(state, proposed, DEVICE, trusted(MON_5PM)))

        val parent = FocusEngine.enterParentPin(state, rules(), "482916", trusted(MON_5PM)).state
        assertEquals(RulesChange.Accepted(proposed), FocusEngine.changeRules(parent, proposed, DEVICE, trusted(MON_5PM)))
    }

    @Test
    fun invalidRulesAreRefusedEvenInAParentSession() {
        val parent = FocusEngine.enterParentPin(stateWith(status()), rules(), "482916", trusted(MON_5PM)).state
        val bad = rules(lockedApps = emptySet(), windows = emptyList(), parentSessionMinutes = 0, doneLimitMinutes = 0)
        val change = FocusEngine.changeRules(parent, bad, DEVICE, trusted(MON_5PM))
        assertEquals(
            RulesChange.Invalid(
                setOf(RuleProblem.NO_LOCKED_APPS, RuleProblem.NO_LOCK_TIMES, RuleProblem.BAD_PARENT_SESSION, RuleProblem.BAD_DONE_LIMIT),
            ),
            change,
        )
    }
}
