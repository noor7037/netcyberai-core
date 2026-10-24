package com.netcyberai.family.focus

import java.time.Instant
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IndiaTimeTest {
    @Test
    fun matchesJavaTimeAcrossDaysAndMidnights() {
        // Every 7 minutes over two years, plus instants before 1970, against java.time in UTC+05:30.
        val starts = listOf(ist(2026, 1, 1, 0, 0), -86_400_000L * 400, 0L)
        for (start in starts) {
            var t = start
            val end = start + 2L * 366 * 86_400_000L
            while (t < end) {
                val want = Instant.ofEpochMilli(t).atOffset(IST)
                val got = IndiaTime.at(t)
                assertEquals(want.toLocalDate().toEpochDay(), got.date.epochDay)
                assertEquals(want.hour * 60 + want.minute, got.minuteOfDay)
                assertEquals(want.dayOfWeek.value, got.weekday)
                t += 7 * 60_000L + 13
            }
        }
    }

    @Test
    fun theIndiaDayTurnsAtMidnightIndiaTimeNotUtc() {
        // 18:29 UTC is 23:59 in India; 18:30 UTC is the next India day.
        val before = Instant.parse("2026-10-26T18:29:59.999Z").toEpochMilli()
        assertEquals(MONDAY, IndiaTime.at(before).date)
        assertEquals(1439, IndiaTime.at(before).minuteOfDay)
        assertEquals(TUESDAY, IndiaTime.at(before + 1).date)
        assertEquals(0, IndiaTime.at(before + 1).minuteOfDay)
    }

    @Test
    fun weekdays() {
        assertEquals(1, MONDAY.weekday)
        assertEquals(2, TUESDAY.weekday)
        assertEquals(4, IndiaDate(0).weekday) // 1970-01-01, a Thursday
        assertEquals(6, date("2026-10-31").weekday)
        assertEquals(7, date("2026-11-01").weekday)
    }

    @Test
    fun parsesAndPrintsEveryDayLikeJavaTime() {
        var d = LocalDate.of(1900, 1, 1)
        val end = LocalDate.of(2101, 1, 1)
        while (d < end) {
            val parsed = IndiaDate.parse(d.toString())
            assertEquals(d.toString(), d.toEpochDay(), parsed!!.epochDay)
            assertEquals(d.toString(), parsed.toString())
            d = d.plusDays(1)
        }
    }

    @Test
    fun refusesWhatIsNotADate() {
        for (bad in listOf("", "2026-2-03", "2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "2026-10-00", "26-10-26",
            "2026-10-26T00:00", " 2026-10-26", "२०२६-१०-२६", "2026/10/26")) {
            assertNull(bad, IndiaDate.parse(bad))
        }
        assertEquals(date("2024-02-29").toString(), "2024-02-29")
    }
}
