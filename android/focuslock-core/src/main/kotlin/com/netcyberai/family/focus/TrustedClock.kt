package com.netcyberai.family.focus

import kotlin.math.abs

// The lock's clock (C304: "the day is the India date from the server, never the phone's clock; a clock change is
// reported as tampering"; docs/34 §9.1 rule 8). A child can change the phone's clock, so the lock keeps time from the
// server instead:
// - Each status reply anchors the clock: the server's time, and the phone's time since boot (Android's
//   elapsedRealtime, which the clock setting cannot move) at that moment.
// - While the phone has not restarted, now = the server's time + the time since boot that has passed. Changing the
//   phone's clock changes nothing; the change is only flagged, for the tamper report (M2b-6).
// - After a restart the time since boot starts again, so until the next status reply the lock uses the phone's clock,
//   corrected by the offset it had at the anchor, and never earlier than the last time it trusted (a floor the plugin
//   saves as it runs). Such a reading is not trusted: it decides lock times, but not "done" (FocusEngine).

/** One status reply's time: the server's clock, and the phone's own clocks when the reply arrived. */
data class ClockAnchor(
    val serverMillis: Long,
    /** Android's elapsedRealtime when the reply arrived. */
    val elapsedMillis: Long,
    /** The phone's wall clock (System.currentTimeMillis) when the reply arrived. */
    val wallMillis: Long,
    /** Identifies one boot of the phone (the plugin reads the boot count), so a restart is never missed. */
    val bootId: String,
)

/**
 * What time the lock takes it to be.
 * - [trusted]: counted from a server anchor in this boot. Only a trusted reading can confirm "done" for today.
 * - [clockChanged]: the phone's clock was moved away from real time (reported as tampering, M2b-6).
 */
data class ClockReading(val epochMillis: Long, val trusted: Boolean, val clockChanged: Boolean)

object TrustedClock {
    /** How far the phone's clock may wander before it counts as changed (network time corrections are seconds). */
    const val CHANGE_TOLERANCE_MILLIS: Long = 2 * MINUTE_MILLIS

    fun read(anchor: ClockAnchor?, floorMillis: Long?, bootId: String, elapsedMillis: Long, wallMillis: Long): ClockReading {
        if (anchor == null) return ClockReading(maxOf(wallMillis, floorMillis ?: Long.MIN_VALUE), trusted = false, clockChanged = false)
        // How far the phone's clock was from the server's when the anchor was taken (many phones are simply wrong).
        val offset = anchor.wallMillis - anchor.serverMillis
        if (bootId == anchor.bootId && elapsedMillis >= anchor.elapsedMillis) {
            val now = anchor.serverMillis + (elapsedMillis - anchor.elapsedMillis)
            val drift = (wallMillis - offset) - now
            return ClockReading(now, trusted = true, clockChanged = abs(drift) > CHANGE_TOLERANCE_MILLIS)
        }
        // The phone restarted since the anchor.
        val estimate = wallMillis - offset
        val floor = maxOf(floorMillis ?: anchor.serverMillis, anchor.serverMillis)
        if (estimate < floor - CHANGE_TOLERANCE_MILLIS) return ClockReading(floor, trusted = false, clockChanged = true)
        return ClockReading(maxOf(estimate, floor), trusted = false, clockChanged = false)
    }

    /**
     * The floor to save after a reading. Time the lock has seen never goes back, except that the server's time
     * replaces a floor that ran ahead of it (a clock moved forward after a restart).
     */
    fun nextFloor(floorMillis: Long?, reading: ClockReading): Long =
        if (reading.trusted) reading.epochMillis else maxOf(floorMillis ?: Long.MIN_VALUE, reading.epochMillis)
}
