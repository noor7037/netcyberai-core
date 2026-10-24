package com.netcyberai.family.focus

import java.time.LocalDateTime
import java.time.ZoneOffset

// Shared test values. Tests may use java.time (they run on the JVM); the engine itself may not (EngineSourceGuardTest).

internal val IST: ZoneOffset = ZoneOffset.ofHoursMinutes(5, 30)

/** Epoch milliseconds of an India wall-clock time. */
internal fun ist(year: Int, month: Int, day: Int, hour: Int, minute: Int): Long =
    LocalDateTime.of(year, month, day, hour, minute).toInstant(IST).toEpochMilli()

internal fun trusted(epochMillis: Long) = ClockReading(epochMillis, trusted = true, clockChanged = false)

internal fun untrusted(epochMillis: Long) = ClockReading(epochMillis, trusted = false, clockChanged = false)

internal fun date(text: String): IndiaDate = IndiaDate.parse(text)!!

// 2026-10-26 is a Monday, 2026-10-31 a Saturday.
internal val MONDAY = date("2026-10-26")
internal val TUESDAY = date("2026-10-27")
internal val MON_5PM = ist(2026, 10, 26, 17, 0)
internal val MON_3PM = ist(2026, 10, 26, 15, 0)
internal val TUE_5PM = ist(2026, 10, 27, 17, 0)
internal val SAT_5PM = ist(2026, 10, 31, 17, 0)

internal const val YOUTUBE = "com.google.android.youtube"
internal const val GAME = "com.example.game"
internal const val KHAN = "org.khanacademy.android"
internal const val CALCULATOR = "com.android.calculator2"

internal val DEVICE = DevicePackages()

/** Weekdays 4-9 pm, YouTube and a game chosen, Khan Academy educational, WhatsApp locked unless chosen open. */
internal fun rules(
    whatsappOpen: Boolean = false,
    lockedApps: Set<String> = setOf(YOUTUBE, GAME),
    doneLimitMinutes: Int? = null,
    parentSessionMinutes: Int = FocusRules.DEFAULT_PARENT_SESSION_MINUTES,
    windows: List<LockWindow> = listOf(LockWindow.at(LockWindow.WEEKDAYS, 16, 0, 21, 0)),
) = FocusRules(
    lockedApps = lockedApps,
    schedule = LockSchedule(windows),
    educationalApps = setOf(KHAN),
    whatsappOpen = whatsappOpen,
    parentSessionMinutes = parentSessionMinutes,
    doneLimitMinutes = doneLimitMinutes,
)

internal val PENDING = listOf(PendingItem("ch-fractions", "Fractions: check 2"), PendingItem("en-unit-3", "English unit 3"))

internal fun child(id: String = "c1", name: String = "Asha", done: Boolean = false, pending: List<PendingItem> = PENDING) =
    ChildStatus(id, name, done, if (done) emptyList() else pending)

internal fun status(day: IndiaDate = MONDAY, vararg children: ChildStatus = arrayOf(child()), pinVersion: String = "v1") =
    FocusStatus(day, children.toList(), pinVersion)

/** A quick PIN hash for tests (the default 100,000 rounds are covered in Rule1ParentPinTest). */
internal fun pinState(pin: String = "482916", version: String = "v1") =
    PinState(PinRecord(PinHasher.hash(pin, iterations = 1_000), version))

internal fun stateWith(status: FocusStatus?, pin: PinState = pinState()): FocusState {
    val base = FocusState(pin = pin)
    return if (status == null) base else FocusEngine.applyStatus(base, status)
}
