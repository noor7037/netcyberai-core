package com.netcyberai.family.focus

// The parent's rules, as the phone keeps them (C304: they live only on the phone, encrypted with a Keystore key by the
// plugin; nothing here is sent anywhere). docs/34 §9.1 rules 4, 5 and 7.

/**
 * One lock time: the weekdays it applies to and the India times it runs, start included, end excluded
 * ("weekdays 4-9 pm" = days 1..5, 16:00 to 21:00).
 * - [days]: ISO weekdays, 1 = Monday ... 7 = Sunday.
 * - [startMinute], [endMinute]: minutes of the day, 0..1440 (1440 = midnight at the end of the day).
 * A time across midnight (9 pm to 7 am) is two windows: 21:00-24:00 on one day and 00:00-07:00 on the next.
 */
data class LockWindow(val days: Set<Int>, val startMinute: Int, val endMinute: Int) {
    val isValid: Boolean
        get() = days.isNotEmpty() && days.all { it in 1..7 } &&
            startMinute in 0 until MINUTES_PER_DAY && endMinute in 1..MINUTES_PER_DAY && startMinute < endMinute

    fun covers(moment: IndiaMoment): Boolean =
        isValid && moment.weekday in days && moment.minuteOfDay >= startMinute && moment.minuteOfDay < endMinute

    companion object {
        val WEEKDAYS: Set<Int> = setOf(1, 2, 3, 4, 5)
        val WEEKEND: Set<Int> = setOf(6, 7)
        val EVERY_DAY: Set<Int> = (1..7).toSet()

        /** A window from hours and minutes, for example at(WEEKDAYS, 16, 0, 21, 0). */
        fun at(days: Set<Int>, startHour: Int, startMin: Int, endHour: Int, endMin: Int): LockWindow =
            LockWindow(days, startHour * 60 + startMin, endHour * 60 + endMin)
    }
}

/** The lock times: a moment is a lock time when any window covers it. */
data class LockSchedule(val windows: List<LockWindow>) {
    fun isLockTime(moment: IndiaMoment): Boolean = windows.any { it.covers(moment) }
}

/**
 * The packages the lock treats specially on this phone (docs/34 §9.1 rules 4, 5 and 8). The plugin adds the phone's
 * own default dialler, SMS, contacts and home-screen apps at run time, because they differ by brand; the defaults
 * here are the stock Android and Google ones.
 * - [alwaysOpen]: never locked, whatever the parent chose (calls always work, rule 4).
 * - [lockedInLockTime]: Settings, the Play Store and the installer, locked during lock times so the lock cannot be
 *   switched off or uninstalled without the PIN (rule 8). Open outside lock times (C304).
 */
data class DevicePackages(
    val ownPackage: String = OWN_PACKAGE,
    val alwaysOpen: Set<String> = DEFAULT_ALWAYS_OPEN,
    val lockedInLockTime: Set<String> = DEFAULT_LOCKED_IN_LOCK_TIME,
) {
    companion object {
        const val OWN_PACKAGE = "com.netcyberai.family"

        /** WhatsApp and WhatsApp Business: open in lock times when the parent chose so (rule 4). */
        val WHATSAPP: Set<String> = setOf("com.whatsapp", "com.whatsapp.w4b")

        val DEFAULT_ALWAYS_OPEN: Set<String> = setOf(
            // the phone dialler, contacts and messages
            "com.android.dialer", "com.google.android.dialer",
            "com.android.contacts", "com.google.android.contacts",
            "com.android.mms", "com.google.android.apps.messaging",
            // calls in progress, the emergency dialler and emergency information
            "com.android.phone", "com.android.server.telecom", "com.android.emergency",
            // the status bar, notifications and the phone's own lock screen
            "com.android.systemui",
        )

        val DEFAULT_LOCKED_IN_LOCK_TIME: Set<String> = setOf(
            "com.android.settings",
            "com.android.vending",
            "com.google.android.packageinstaller", "com.android.packageinstaller",
        )
    }
}

/**
 * The parent's rules (set-up, M2b-4).
 * - [lockedApps]: the apps the parent chose to lock in lock times; every other app stays open (rule 5).
 * - [educationalApps]: apps the parent marked educational; they stay open (rule 5).
 * - [whatsappOpen]: whether WhatsApp stays open in lock times (rule 4); when false it is locked only if chosen.
 * - [parentSessionMinutes]: how long a parent session lasts before it re-locks by itself (rule 7, 30 by default).
 * - [doneLimitMinutes]: once today's plan is done, how many minutes of the locked apps the child may use in that
 *   day's lock times; null for no limit (rule 2, "up to a limit the parent may set").
 */
data class FocusRules(
    val lockedApps: Set<String>,
    val schedule: LockSchedule,
    val educationalApps: Set<String> = emptySet(),
    val whatsappOpen: Boolean,
    val parentSessionMinutes: Int = DEFAULT_PARENT_SESSION_MINUTES,
    val doneLimitMinutes: Int? = null,
) {
    /** What stops these rules from being saved; empty when they are fine. */
    fun problems(device: DevicePackages): Set<RuleProblem> {
        val out = mutableSetOf<RuleProblem>()
        if (lockedApps.isEmpty()) out += RuleProblem.NO_LOCKED_APPS
        if (schedule.windows.isEmpty()) out += RuleProblem.NO_LOCK_TIMES
        if (schedule.windows.any { !it.isValid }) out += RuleProblem.BAD_LOCK_TIME
        if (parentSessionMinutes !in PARENT_SESSION_RANGE) out += RuleProblem.BAD_PARENT_SESSION
        if (doneLimitMinutes != null && doneLimitMinutes !in DONE_LIMIT_RANGE) out += RuleProblem.BAD_DONE_LIMIT
        val neverLocked = device.alwaysOpen + device.lockedInLockTime + device.ownPackage
        if (lockedApps.any { it in neverLocked }) out += RuleProblem.CANNOT_LOCK
        if (lockedApps.any { it in educationalApps }) out += RuleProblem.LOCKED_AND_EDUCATIONAL
        return out
    }

    companion object {
        const val DEFAULT_PARENT_SESSION_MINUTES = 30
        val PARENT_SESSION_RANGE = 1..240
        val DONE_LIMIT_RANGE = 1..MINUTES_PER_DAY
    }
}

enum class RuleProblem {
    NO_LOCKED_APPS,
    NO_LOCK_TIMES,
    BAD_LOCK_TIME,
    BAD_PARENT_SESSION,
    BAD_DONE_LIMIT,

    /** Our app, the calling apps, Settings, the Play Store or the installer were chosen; they have their own rules. */
    CANNOT_LOCK,
    LOCKED_AND_EDUCATIONAL,
}
