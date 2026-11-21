package com.netcyberai.focus

import android.content.Context
import android.os.SystemClock
import com.netcyberai.family.focus.ClockAnchor
import com.netcyberai.family.focus.ClockReading
import com.netcyberai.family.focus.FocusEngine
import com.netcyberai.family.focus.FocusRules
import com.netcyberai.family.focus.LockSchedule
import com.netcyberai.family.focus.LockWindow
import com.netcyberai.family.focus.TrustedClock

// The Focus app's steps that talk to the server (C538), each run off the main thread. The rules, the PIN and every
// decision stay on the phone (FocusEngine); the server only says what today's plan is (status) and hears the lock's
// health (heartbeat).
object Focus {
    enum class Net { OK, OFFLINE, REMOVED, FAILED }

    sealed class PinOnline {
        data object Ok : PinOnline()
        data object Wrong : PinOnline()
        data class Wait(val minutes: Int) : PinOnline()
        data object NoPin : PinOnline()
        data object Offline : PinOnline()
    }

    fun clock(ctx: Context, s: Saved = Store.get(ctx)): ClockReading =
        TrustedClock.read(s.anchor, s.floorMillis, Phone.bootId(ctx), SystemClock.elapsedRealtime(), System.currentTimeMillis())

    /** The parent's starting rules: the ticked apps, Monday to Friday 4 pm to 9 pm, WhatsApp open (C538). */
    fun defaultRules(locked: Set<String>): FocusRules =
        FocusRules(lockedApps = locked, schedule = LockSchedule(listOf(LockWindow.at(LockWindow.WEEKDAYS, 16, 0, 21, 0))), whatsappOpen = true)

    fun isConnected(s: Saved): Boolean = s.session != null && !s.removed

    /** Trades a pass the Family app handed over for this app's own session. */
    fun redeem(ctx: Context): Net {
        val s = Store.get(ctx)
        val pass = s.pass ?: return Net.FAILED
        val r = Api.redeem(s.deviceId, pass)
        if (r.code == 0) return Net.OFFLINE
        val session = r.body.optString("session").takeIf { r.code == 200 && it.isNotEmpty() }
        Store.update(ctx) { it.copy(pass = null, session = session ?: it.session, removed = if (session != null) false else it.removed) }
        return if (session != null) refreshStatus(ctx) else Net.FAILED
    }

    /** Today's plan from the server; anchors the lock's clock to the server's. */
    fun refreshStatus(ctx: Context): Net {
        val s = Store.get(ctx)
        val session = s.session ?: return Net.REMOVED
        val wall = System.currentTimeMillis()
        val elapsed = SystemClock.elapsedRealtime()
        val r = Api.status(s.deviceId, session)
        if (r.code == 0) return Net.OFFLINE
        if (r.code == 401 || r.code == 404 || (r.code == 403 && r.body.optString("error") == "off")) {
            Store.update(ctx) { it.copy(removed = true) }
            return Net.REMOVED
        }
        val status = if (r.code == 200) Store.statusFrom(r.body) else null
        if (status == null) return Net.FAILED
        Store.update(ctx) { cur ->
            val anchor = r.serverMillis?.let { ClockAnchor(it, elapsed, wall, Phone.bootId(ctx)) } ?: cur.anchor
            cur.copy(state = FocusEngine.applyStatus(cur.state, status), anchor = anchor, removed = false, session = r.renewedSession ?: cur.session)
        }
        return Net.OK
    }

    /** At set-up, or after a reset: the PIN checked once against the server, then kept here as a salted hash only. */
    fun checkPinOnline(ctx: Context, pin: String): PinOnline {
        val s = Store.get(ctx)
        val session = s.session ?: return PinOnline.Offline
        if (refreshStatus(ctx) == Net.OFFLINE) return PinOnline.Offline
        val r = Api.checkPin(s.deviceId, session, pin)
        return when (r.code) {
            0 -> PinOnline.Offline
            200 -> {
                val version = Store.get(ctx).state.status?.pinVersion ?: ""
                Store.update(ctx) { cur ->
                    val rules = cur.rules ?: defaultRules(emptySet())
                    cur.copy(state = FocusEngine.installPin(cur.state, rules, pin, version, clock(ctx, cur)))
                }
                PinOnline.Ok
            }
            409 -> PinOnline.NoPin
            429 -> PinOnline.Wait(r.body.optInt("minutes", 1))
            else -> PinOnline.Wrong
        }
    }

    /** The lock's health: three flags only. */
    fun heartbeat(ctx: Context, lockOn: Boolean): Net {
        val s = Store.get(ctx)
        val session = s.session ?: return Net.REMOVED
        val r = Api.heartbeat(s.deviceId, session, lockOn, Phone.lockPermissionsOk(ctx), clock(ctx, s).clockChanged)
        return when {
            r.code == 0 -> Net.OFFLINE
            r.code == 401 || r.code == 404 -> { Store.update(ctx) { it.copy(removed = true) }; Net.REMOVED }
            r.code == 200 -> Net.OK
            else -> Net.FAILED
        }
    }

    /** The lock is ready to start: connected, the PIN in, the rules set, the permissions on. */
    fun canStart(ctx: Context, s: Saved): Boolean =
        isConnected(s) && s.state.pin.record != null && s.rules != null && Phone.lockPermissionsOk(ctx) && Phone.hasNotifications(ctx)

    fun startLock(ctx: Context) {
        Store.update(ctx) { it.copy(enabled = true) }
        FocusService.start(ctx)
    }
}
