package com.netcyberai.focus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import com.netcyberai.family.focus.BlockReason
import com.netcyberai.family.focus.Decision
import com.netcyberai.family.focus.DevicePackages
import com.netcyberai.family.focus.FocusEngine
import com.netcyberai.family.focus.IndiaTime
import com.netcyberai.family.focus.TrustedClock
import java.util.concurrent.Executors

// The lock itself (C304, C538; M2b-5): a foreground service with the visible "Focus Lock is on" notification. While
// the screen is on it reads the app in front (usage access, on the phone only) about every 0.7 seconds, asks the rule
// engine, and covers a locked app with the block screen. It asks the server for today's plan every 5 minutes in lock
// times (and at once when a locked app is opened, so finished study opens the apps within seconds), and reports the
// lock's health every 30 minutes in lock times, with "the lock is on" false once when a lock time ends.
class FocusService : Service() {
    companion object {
        private const val CHANNEL = "focus"
        private const val NOTE = 7
        private const val TICK_ON = 700L
        private const val TICK_OFF = 5_000L
        private const val STATUS_EVERY = 5 * 60_000L
        private const val STATUS_ON_BLOCK = 20_000L
        private const val BEAT_EVERY = 30 * 60_000L
        private const val FLUSH_EVERY = 60_000L
        private const val DEVICE_EVERY = 10 * 60_000L
        private const val EVENT_RESUMED = 1
        private const val EVENT_PAUSED = 2
        private const val EVENT_STOPPED = 23

        fun start(ctx: Context) {
            val s = Store.get(ctx)
            if (!s.enabled) return
            runCatching { ctx.startForegroundService(Intent(ctx, FocusService::class.java)) }
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var overlay: BlockOverlay
    private var running = false
    private var current: String? = null
    private var currentAt = 0L
    private val resumed = HashMap<String, Pair<String, Long>>()
    private var sentHomeFor: String? = null
    private var homes: Set<String> = emptySet()
    private var lastQuery = 0L
    private var lastTick = 0L
    private var statusAt = 0L
    private var beatAt = 0L
    private var flushAt = 0L
    private var device: DevicePackages? = null
    private var deviceAt = 0L
    private var wasLockTime = false
    private var endPending = false
    private var permissionsOk = true
    private var busy = false

    private val screen = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            if (i.action == Intent.ACTION_SCREEN_OFF) {
                // Rule 7: the parent session ends; a shared phone asks "Who is using the phone?" again.
                Store.update(c) { it.copy(state = FocusEngine.onScreenOff(it.state)) }
                overlay.hide()
            } else {
                statusAt = 0L
                schedule(0)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        overlay = BlockOverlay(this) { tick() }
        Store.update(this) { it.copy(state = FocusEngine.onScreenOff(it.state)) }
        registerReceiver(screen, IntentFilter().apply { addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON) })
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        showNotification(Phone.lockPermissionsOk(this))
        if (!running) {
            running = true
            schedule(0)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        main.removeCallbacksAndMessages(null)
        runCatching { unregisterReceiver(screen) }
        overlay.hide()
        Store.flush(this)
        io.shutdown()
        super.onDestroy()
    }

    private fun schedule(delay: Long) {
        main.removeCallbacksAndMessages(null)
        if (running) main.postDelayed({ tick() }, delay)
    }

    private fun background(job: () -> Unit): Boolean {
        if (busy) return false
        busy = true
        io.execute {
            try { job() } finally { main.post { busy = false; schedule(0) } }
        }
        return true
    }

    private fun tick() {
        if (!running) return
        val s = Store.get(this)
        val rules = s.rules
        if (!s.enabled || rules == null) {
            overlay.hide()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            running = false
            return
        }
        val now = SystemClock.elapsedRealtime()
        val clock = Focus.clock(this, s)
        Store.touch(this) { it.copy(floorMillis = TrustedClock.nextFloor(it.floorMillis, clock)) }
        val lockTime = rules.schedule.isLockTime(IndiaTime.at(clock.epochMillis))

        // Permissions, with the notification and the heartbeat told when one is switched off.
        val ok = Phone.lockPermissionsOk(this)
        if (ok != permissionsOk) {
            permissionsOk = ok
            showNotification(ok)
            beatAt = 0L
        }

        // The server: the end of a lock time is reported once; reports every 30 minutes in lock times; today's plan.
        if (wasLockTime && !lockTime) endPending = true
        wasLockTime = lockTime
        if (Focus.isConnected(s) && !busy) {
            when {
                endPending -> if (background { Focus.heartbeat(this, lockOn = false) }) endPending = false
                lockTime && (beatAt == 0L || now - beatAt > BEAT_EVERY) -> if (background { Focus.heartbeat(this, lockOn = true) }) beatAt = now
                statusAt == 0L || now - statusAt > (if (lockTime) STATUS_EVERY else 6 * STATUS_EVERY) -> if (background { Focus.refreshStatus(this) }) statusAt = now
            }
        }

        if (now - flushAt > FLUSH_EVERY) { flushAt = now; Store.flush(this) }
        val interactive = getSystemService(PowerManager::class.java)?.isInteractive ?: true
        if (!interactive || !ok) {
            overlay.hide()
            schedule(TICK_OFF)
            return
        }

        val pkg = foreground()
        // Removed from the Family app, or Control switched it off: the lock never holds a child.
        if (pkg == null || s.removed) {
            overlay.hide()
        } else {
            if (device == null || now - deviceAt > DEVICE_EVERY) { device = Phone.devicePackages(this); homes = Phone.homes(this) + "com.android.systemui"; deviceAt = now }
            when (val d = FocusEngine.decide(pkg, rules, device!!, s.state, clock)) {
                is Decision.Open -> {
                    // After a block the locked app was sent to the home screen: the block screen stays over the home
                    // screen and the recent apps until the child taps a button, so nothing locked shows behind it.
                    if (!(overlay.isShown && pkg in homes)) overlay.hide()
                    val child = d.limitChildId
                    if (child != null && lastTick > 0) Store.touch(this) { it.copy(state = FocusEngine.recordLockedUse(it.state, child, now - lastTick, clock)) }
                }
                is Decision.Blocked -> {
                    overlay.show(d, s.lang)
                    // Stop the locked app (a video would play on behind the block screen): send it to the background,
                    // once for each time it is opened.
                    val opened = "$pkg@$currentAt"
                    if (overlay.isShown && sentHomeFor != opened) {
                        sentHomeFor = opened
                        Phone.openHome(this)
                    }
                    // Study may have just been finished: ask at once, so the apps open within seconds.
                    if (d.reason == BlockReason.PLAN_NOT_DONE && now - statusAt > STATUS_ON_BLOCK && Focus.isConnected(s)) {
                        if (background { Focus.refreshStatus(this) }) statusAt = now
                    }
                }
            }
        }
        lastTick = now
        schedule(TICK_ON)
    }

    /** The app in front, from the phone's own usage events (never stored, never sent). */
    private fun foreground(): String? {
        val usm = getSystemService(UsageStatsManager::class.java) ?: return current
        val end = System.currentTimeMillis()
        val begin = if (lastQuery == 0L || end < lastQuery) end - 5 * 60_000 else lastQuery - 2_000
        val events = runCatching { usm.queryEvents(begin, end) }.getOrNull() ?: return current
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val key = "${e.packageName}/${e.className}"
            when (e.eventType) {
                // ACTIVITY_RESUMED (API 29) has the value of MOVE_TO_FOREGROUND (1).
                EVENT_RESUMED -> if (e.timeStamp >= (resumed[key]?.second ?: 0L)) resumed[key] = e.packageName to e.timeStamp
                EVENT_PAUSED, EVENT_STOPPED -> if (e.timeStamp >= (resumed[key]?.second ?: 0L)) resumed.remove(key)
            }
        }
        lastQuery = end
        // The app in front is the latest activity still resumed. Recent apps with a live picture of the app (Pixel and
        // others) keep that app resumed under the overview, so when the overview closes the app is in front again even
        // though no new "resumed" event comes (founder's phone, 21 Nov: back from recent apps passed the lock).
        if (resumed.size > 64) resumed.entries.sortedBy { it.value.second }.take(resumed.size - 64).forEach { resumed.remove(it.key) }
        val top = resumed.values.maxByOrNull { it.second }
        if (top != null) {
            current = top.first
            currentAt = top.second
        }
        return current
    }

    private fun showNotification(ok: Boolean) {
        val lang = Store.get(this).lang
        val nm = getSystemService(NotificationManager::class.java)!!
        nm.createNotificationChannel(NotificationChannel(CHANNEL, Words.t(lang, "notif.channel"), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(Words.t(lang, "notif.title"))
            .setContentText(Words.t(lang, if (ok) "notif.text" else "notif.fix"))
            .setContentIntent(open)
            .setOngoing(true)
            .setShowWhen(false)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(NOTE, n)
    }
}
