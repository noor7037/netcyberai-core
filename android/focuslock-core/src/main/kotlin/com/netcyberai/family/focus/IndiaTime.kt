package com.netcyberai.family.focus

// India time for the lock (docs/34 §9.1 rules 2 and 5). India Standard Time is UTC+05:30 all year, with no daylight
// saving, so the India date, the weekday and the minute of the day follow from epoch milliseconds by plain arithmetic.
// - Lock times are India wall-clock times whatever time zone the phone is set to, so changing the phone's time zone
//   opens nothing.
// - No java.time: it is missing on Android 6 and 7 (API 23 to 25), which the app still supports (minSdk 23).

internal const val MINUTE_MILLIS = 60_000L
internal const val DAY_MILLIS = 86_400_000L
internal const val MINUTES_PER_DAY = 1_440

internal fun floorDiv(a: Long, b: Long): Long {
    val q = a / b
    return if ((a % b != 0L) && ((a < 0) != (b < 0))) q - 1 else q
}

internal fun floorMod(a: Long, b: Long): Long = a - floorDiv(a, b) * b

object IndiaTime {
    /** UTC+05:30. */
    const val OFFSET_MILLIS: Long = (5 * 60 + 30) * MINUTE_MILLIS

    /** The India date and minute of the day at [epochMillis]. */
    fun at(epochMillis: Long): IndiaMoment {
        val local = epochMillis + OFFSET_MILLIS
        return IndiaMoment(IndiaDate(floorDiv(local, DAY_MILLIS)), (floorMod(local, DAY_MILLIS) / MINUTE_MILLIS).toInt())
    }
}

/** A minute in India: the date and the minute of that day (0 = midnight, 1439 = 23:59). */
data class IndiaMoment(val date: IndiaDate, val minuteOfDay: Int) {
    /** ISO weekday: 1 = Monday ... 7 = Sunday. */
    val weekday: Int get() = date.weekday
}

/**
 * A calendar date in India, held as days since 1970-01-01. The server sends it as "YYYY-MM-DD" (the day "today's plan"
 * belongs to, M2-2), and that is the only source of "today" the lock trusts for "done".
 */
data class IndiaDate(val epochDay: Long) : Comparable<IndiaDate> {
    /** ISO weekday: 1 = Monday ... 7 = Sunday. 1970-01-01 was a Thursday (4). */
    val weekday: Int get() = (floorMod(epochDay + 3, 7L) + 1).toInt()

    override fun compareTo(other: IndiaDate): Int = epochDay.compareTo(other.epochDay)

    /** "YYYY-MM-DD", as the server writes it (ASCII digits whatever the phone's language). */
    override fun toString(): String {
        val (y, m, d) = civilFromDays(epochDay)
        return "${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
    }

    companion object {
        private val ISO = Regex("^([0-9]{4})-([0-9]{2})-([0-9]{2})$")

        /** Reads "YYYY-MM-DD"; null for anything else, including a date that does not exist (2026-02-30). */
        fun parse(text: String): IndiaDate? {
            val m = ISO.matchEntire(text) ?: return null
            val (y, mo, d) = m.destructured
            val month = mo.toInt()
            val day = d.toInt()
            if (month !in 1..12 || day !in 1..31) return null
            val date = IndiaDate(daysFromCivil(y.toLong(), month, day))
            return if (date.toString() == text) date else null
        }

        // Howard Hinnant's days_from_civil and civil_from_days (proleptic Gregorian calendar).
        private fun daysFromCivil(year: Long, month: Int, day: Int): Long {
            val y = if (month <= 2) year - 1 else year
            val era = floorDiv(y, 400)
            val yoe = y - era * 400
            val mp = (month + 9) % 12
            val doy = (153 * mp + 2) / 5 + day - 1
            val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
            return era * 146_097 + doe - 719_468
        }

        private fun civilFromDays(epochDay: Long): Triple<Long, Int, Int> {
            val z = epochDay + 719_468
            val era = floorDiv(z, 146_097)
            val doe = z - era * 146_097
            val yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365
            val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
            val mp = (5 * doy + 2) / 153
            val day = (doy - (153 * mp + 2) / 5 + 1).toInt()
            val month = (if (mp < 10) mp + 3 else mp - 9).toInt()
            val year = yoe + era * 400 + if (month <= 2) 1 else 0
            return Triple(year, month, day)
        }
    }
}
