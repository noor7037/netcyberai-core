package com.netcyberai.family.focus

import java.security.SecureRandom

// The Focus Lock's rule engine (docs/34 §9.1; decisions C304; M2b-3). Pure functions over plain values: the plugin
// (M2b-4, M2b-5) reads the app in front, the clocks and the status reply, asks decide(), and draws the block screen
// or lets the app through. It keeps FocusState in the encrypted rules file.

/** One pending item for the block screen (rules 3 and 6): its key opens it, its title is shown. */
data class PendingItem(val key: String, val title: String)

/** One child set for this phone, from the status reply (M2b-1). [planDone] comes only from checked answers (M2-2). */
data class ChildStatus(val childId: String, val name: String, val planDone: Boolean, val pending: List<PendingItem>)

/** GET /api/family/focus/status (M2b-1): the server's India date, the children set for this phone, the PIN version. */
data class FocusStatus(val indiaDate: IndiaDate, val children: List<ChildStatus>, val pinVersion: String)

/** A parent session opened by the PIN (rule 7): open from [startedAtMillis] until [endsAtMillis], in lock time. */
data class ParentSession(val startedAtMillis: Long, val endsAtMillis: Long) {
    fun isActive(nowMillis: Long): Boolean = nowMillis in startedAtMillis until endsAtMillis
}

/**
 * What the lock remembers between decisions.
 * - [doneOn]: per child, the server's India date on which the server said today's plan was done. It sticks for that
 *   day (C304), even if a later reply that day says otherwise or the phone goes offline.
 * - [usageDate], [usedAfterDoneMillis]: per child, minutes of locked apps used after "done" that day, for the
 *   parent's limit (rule 2).
 * - [childInUse]: on a shared phone, the child who answered "Who is using the phone?"; it ends when the screen turns off.
 */
data class FocusState(
    val status: FocusStatus? = null,
    val doneOn: Map<String, IndiaDate> = emptyMap(),
    val usageDate: IndiaDate? = null,
    val usedAfterDoneMillis: Map<String, Long> = emptyMap(),
    val parentSession: ParentSession? = null,
    val childInUse: String? = null,
    val pin: PinState = PinState(null),
)

enum class OpenReason {
    OWN_APP,
    ALWAYS_OPEN,
    PARENT_SESSION,
    OUTSIDE_LOCK_TIME,
    EDUCATIONAL,
    WHATSAPP_CHOSEN_OPEN,
    NOT_CHOSEN,
    PLAN_DONE,
}

enum class BlockReason {
    /** Today's plan is not done (or not yet known to be done): show the pending list. */
    PLAN_NOT_DONE,

    /** Done, but the parent's limit of minutes after "done" is used up for today. */
    DONE_LIMIT_REACHED,

    /** A shared phone with more than one child: ask "Who is using the phone?" first. */
    CHOOSE_CHILD,

    /** Settings, the Play Store or the installer in lock times: only the parent PIN opens them. */
    PIN_REQUIRED,
}

/** A child to offer under "Who is using the phone?". */
data class ChildChoice(val childId: String, val name: String)

sealed class Decision {
    /**
     * Let the app through. [limitChildId] is set when the app is open only because that child's plan is done and the
     * parent set a limit: the plugin then counts the time in front with FocusEngine.recordLockedUse.
     */
    data class Open(val reason: OpenReason, val limitChildId: String? = null) : Decision()

    /**
     * Cover the app with the block screen.
     * - [pending] lists what is left, in the server's order; [next] is the item the "start the next one" button opens.
     * - [pendingIsCurrent] is false when the latest reply is from an earlier day (offline): the screen then asks to
     *   connect instead of showing yesterday's list.
     */
    data class Blocked(
        val reason: BlockReason,
        val childId: String? = null,
        val pending: List<PendingItem> = emptyList(),
        val pendingIsCurrent: Boolean = false,
        val children: List<ChildChoice> = emptyList(),
    ) : Decision() {
        val next: PendingItem? get() = pending.firstOrNull()
    }
}

/** The outcome of a PIN entry: the new state (a parent session on success) and what to tell the parent. */
data class PinEntry(val state: FocusState, val result: PinResult)

sealed class RulesChange {
    data class Accepted(val rules: FocusRules) : RulesChange()

    /** Only a parent session changes the rules (rule 1: the PIN guards every setting; rule 8). */
    data object NeedsParentPin : RulesChange()
    data class Invalid(val problems: Set<RuleProblem>) : RulesChange()
}

object FocusEngine {
    /**
     * Whether [packageName], in front now, may be used. In order:
     * 1. our own app and the calling apps are always open (rules 4 and 5);
     * 2. a parent session opens everything (rule 7);
     * 3. outside lock times everything is open (rule 5);
     * 4. in lock times Settings, the Play Store and the installer need the PIN (rule 8);
     * 5. educational apps, and WhatsApp if the parent chose, stay open; apps the parent did not choose stay open (4, 5);
     * 6. a chosen app opens only when today's plan is done, up to the parent's limit (rule 2); otherwise the block
     *    screen lists what is pending (rules 3 and 6).
     */
    fun decide(packageName: String, rules: FocusRules, device: DevicePackages, state: FocusState, clock: ClockReading): Decision {
        if (packageName == device.ownPackage) return Decision.Open(OpenReason.OWN_APP)
        if (packageName in device.alwaysOpen) return Decision.Open(OpenReason.ALWAYS_OPEN)
        if (isParentSessionActive(state, clock)) return Decision.Open(OpenReason.PARENT_SESSION)
        val now = IndiaTime.at(clock.epochMillis)
        if (!rules.schedule.isLockTime(now)) return Decision.Open(OpenReason.OUTSIDE_LOCK_TIME)
        if (packageName in device.lockedInLockTime) return Decision.Blocked(BlockReason.PIN_REQUIRED)
        if (packageName in rules.educationalApps) return Decision.Open(OpenReason.EDUCATIONAL)
        if (rules.whatsappOpen && packageName in DevicePackages.WHATSAPP) return Decision.Open(OpenReason.WHATSAPP_CHOSEN_OPEN)
        if (packageName !in rules.lockedApps) return Decision.Open(OpenReason.NOT_CHOSEN)
        return planGate(rules, state, clock, now.date)
    }

    private fun planGate(rules: FocusRules, state: FocusState, clock: ClockReading, today: IndiaDate): Decision {
        val children = state.status?.children.orEmpty()
        val child = if (children.size == 1) children[0] else children.firstOrNull { it.childId == state.childInUse }
        if (child == null) {
            if (children.size > 1) return Decision.Blocked(BlockReason.CHOOSE_CHILD, children = children.map { ChildChoice(it.childId, it.name) })
            return Decision.Blocked(BlockReason.PLAN_NOT_DONE)
        }
        if (isDoneToday(state, child.childId, clock, today)) {
            val limit = rules.doneLimitMinutes ?: return Decision.Open(OpenReason.PLAN_DONE)
            if (usedToday(state, child.childId, today) >= limit * MINUTE_MILLIS) {
                return Decision.Blocked(BlockReason.DONE_LIMIT_REACHED, childId = child.childId)
            }
            return Decision.Open(OpenReason.PLAN_DONE, limitChildId = child.childId)
        }
        val current = state.status?.indiaDate == today
        return Decision.Blocked(
            BlockReason.PLAN_NOT_DONE,
            childId = child.childId,
            pending = if (current) child.pending else emptyList(),
            pendingIsCurrent = current,
        )
    }

    /**
     * "Done" holds only for the server's India date it was given on, and only on a trusted clock: after a restart the
     * lock waits for the next status reply rather than take "today" from the phone's clock (C304).
     */
    fun isDoneToday(state: FocusState, childId: String, clock: ClockReading, today: IndiaDate = IndiaTime.at(clock.epochMillis).date): Boolean =
        clock.trusted && state.doneOn[childId] == today

    /**
     * Takes in a status reply. "Done" sticks: a child marked done for a date stays done for that date. A reply older
     * than the one already held is ignored. Marks for earlier days, and for children no longer set for this phone,
     * are dropped. A changed PIN version ends any parent session (the PIN was reset).
     */
    fun applyStatus(state: FocusState, status: FocusStatus): FocusState {
        val held = state.status
        if (held != null && status.indiaDate < held.indiaDate) return state
        val ids = status.children.map { it.childId }.toSet()
        val doneOn = state.doneOn.filter { (id, date) -> id in ids && date >= status.indiaDate }.toMutableMap()
        for (c in status.children) if (c.planDone) doneOn[c.childId] = status.indiaDate
        val pinChanged = state.pin.record != null && state.pin.record.version != status.pinVersion
        return state.copy(
            status = status,
            doneOn = doneOn,
            childInUse = state.childInUse?.takeIf { it in ids },
            parentSession = if (pinChanged) null else state.parentSession,
        )
    }

    /** The parent enters the PIN on the phone; the right PIN opens a parent session for the parent's set length. */
    fun enterParentPin(state: FocusState, rules: FocusRules, pin: String, clock: ClockReading): PinEntry {
        val check = PinGuard.check(state.pin, pin, state.status?.pinVersion, clock.epochMillis)
        var next = state.copy(pin = check.state)
        if (check.result == PinResult.Ok) {
            val start = clock.epochMillis
            next = next.copy(parentSession = ParentSession(start, start + rules.parentSessionMinutes * MINUTE_MILLIS))
        }
        return PinEntry(next, check.result)
    }

    /** Installs the PIN the server just confirmed (set-up, or after a reset) and opens a parent session for set-up. */
    fun installPin(state: FocusState, rules: FocusRules, pin: String, version: String, clock: ClockReading, random: SecureRandom = SecureRandom()): FocusState {
        val start = clock.epochMillis
        return state.copy(
            pin = PinGuard.install(pin, version, random),
            parentSession = ParentSession(start, start + rules.parentSessionMinutes * MINUTE_MILLIS),
        )
    }

    fun isParentSessionActive(state: FocusState, clock: ClockReading): Boolean = state.parentSession?.isActive(clock.epochMillis) == true

    /** The parent ends the session by hand ("lock now"). */
    fun endParentSession(state: FocusState): FocusState = state.copy(parentSession = null)

    /**
     * The screen turned off (and at every start of the lock, since a restart turns it off too): the parent session
     * ends (rule 7) and a shared phone asks "Who is using the phone?" again (C304).
     */
    fun onScreenOff(state: FocusState): FocusState = state.copy(parentSession = null, childInUse = null)

    /** "Who is using the phone?" answered; ignored for a child not set for this phone. */
    fun chooseChild(state: FocusState, childId: String): FocusState =
        if (state.status?.children?.any { it.childId == childId } == true) state.copy(childInUse = childId) else state

    /** Counts [millis] of a locked app used after "done" (Decision.Open.limitChildId), against today's limit. */
    fun recordLockedUse(state: FocusState, childId: String, millis: Long, clock: ClockReading): FocusState {
        if (millis <= 0) return state
        val today = IndiaTime.at(clock.epochMillis).date
        val used = if (state.usageDate == today) state.usedAfterDoneMillis else emptyMap()
        return state.copy(usageDate = today, usedAfterDoneMillis = used + (childId to (used[childId] ?: 0L) + millis))
    }

    fun usedToday(state: FocusState, childId: String, today: IndiaDate): Long =
        if (state.usageDate == today) state.usedAfterDoneMillis[childId] ?: 0L else 0L

    /** A change to the rules (or switching the lock off): only inside a parent session, and only valid rules. */
    fun changeRules(state: FocusState, proposed: FocusRules, device: DevicePackages, clock: ClockReading): RulesChange {
        if (!isParentSessionActive(state, clock)) return RulesChange.NeedsParentPin
        val problems = proposed.problems(device)
        return if (problems.isEmpty()) RulesChange.Accepted(proposed) else RulesChange.Invalid(problems)
    }
}
