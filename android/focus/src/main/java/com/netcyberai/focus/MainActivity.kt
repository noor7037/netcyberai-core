package com.netcyberai.focus

import android.Manifest
import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.View
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import com.netcyberai.family.focus.Brand
import com.netcyberai.family.focus.FocusEngine
import com.netcyberai.family.focus.FocusRules
import com.netcyberai.family.focus.LockSchedule
import com.netcyberai.family.focus.LockWindow
import com.netcyberai.family.focus.OemGuide
import com.netcyberai.family.focus.OemStep
import com.netcyberai.family.focus.PinResult
import com.netcyberai.family.focus.RulesChange
import com.netcyberai.family.focus.StepKind
import java.util.Locale

// The Focus app's own screens (C538), one at a time, each a few large lines:
// 1. Welcome and connect: what the lock does and what never leaves the phone; "Open NetCyberAI Family" (the parent
//    taps Connect there, and this app opens again with its pass, no code to type).
// 2. The parent PIN, checked once against the server, then kept here as a salted hash.
// 3. Set-up: the permissions, one step each with the phone's own screen and "Listen", the brand's steps; the apps
//    (already ticked), WhatsApp, the times (already set). "Start" only when every step is done.
// 4. Home: on or off, today's study per child, and the parent's buttons (each behind the PIN).
class MainActivity : Activity() {
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var working = false
    private var message: String? = null
    private var wantSetup = false
    private var askOff = false

    // "Turn on" (C538, founder 21 Nov: fewer steps): the app opens each phone screen in turn and reads the step aloud; the
    // parent only switches NetCyberAI Focus on and presses Back. [lastAsked] is the screen just opened; coming back with
    // it still off stops the run and shows help ([stuck]) instead of opening it again and again.
    private var flow = false
    private var lastAsked: String? = null
    private var stuck: String? = null
    private var notifyAsked = false

    // The set-up draft, kept while the parent visits the phone's screens.
    private var draftLocked: MutableSet<String>? = null
    private var draftWhatsapp = true
    private var draftDays = LockWindow.WEEKDAYS.toMutableSet()
    private var draftStart = 16 * 60
    private var draftEnd = 21 * 60

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this) { ttsReady = it == TextToSpeech.SUCCESS }
    }

    override fun onResume() {
        super.onResume()
        val s = Store.get(this)
        if (s.pass != null && !working) background { Focus.redeem(this).let { if (it != Focus.Net.OK) message = Words.t(Store.get(this).lang, "connect.failed") } }
        else if (Focus.isConnected(s) && !working) Thread { Focus.refreshStatus(this); runOnUiThread { if (!working && !flow) render() } }.start()
        if (flow && !working) advance() else render()
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }

    private fun background(job: () -> Unit) {
        working = true
        render()
        Thread {
            try { job() } finally { runOnUiThread { working = false; render() } }
        }.start()
    }

    private val lang: String get() = Store.get(this).lang

    private fun w(key: String, vararg args: Pair<String, Any>) = Words.t(lang, key, *args)

    private fun say(text: String) {
        val t = tts ?: return
        if (!ttsReady) return
        t.language = Locale.forLanguageTag(if (lang == "hi") "hi-IN" else "en-IN")
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "step")
    }

    private fun page(build: (LinearLayout) -> Unit) {
        val col = Ui.column(this, 20)
        col.setBackgroundColor(Ui.OFF_WHITE)
        val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
        top.addView(Ui.button(this, w("lang.other"), primary = false) {
            Store.update(this) { it.copy(lang = if (it.lang == "hi") "en" else "hi") }
            render()
        }.apply { layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); setPadding(Ui.dp(context, 20), 0, Ui.dp(context, 20), 0) })
        col.addView(top)
        build(col)
        message?.let { col.addView(Ui.text(this, it, color = Ui.CORAL_DEEP, bold = true)) }
        col.addView(Ui.gap(this, 40))
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Ui.OFF_WHITE)
            addView(col)
            // Android 15 draws apps edge to edge: keep the page clear of the status and navigation bars.
            setOnApplyWindowInsetsListener { v, insets ->
                val bars = if (Build.VERSION.SDK_INT >= 30) insets.getInsets(android.view.WindowInsets.Type.systemBars()) else null
                @Suppress("DEPRECATION")
                v.setPadding(0, bars?.top ?: insets.systemWindowInsetTop, 0, bars?.bottom ?: insets.systemWindowInsetBottom)
                insets
            }
        })
    }

    private fun render() {
        val s = Store.get(this)
        when {
            working -> page { it.addView(Ui.title(this, w("connect.working"))) }
            !Focus.isConnected(s) -> welcome(s)
            s.state.pin.record == null || s.state.pin.record?.version != (s.state.status?.pinVersion ?: s.state.pin.record?.version) -> pinOnline()
            wantSetup -> if (FocusEngine.isParentSessionActive(s.state, Focus.clock(this, s))) setup(s) else pinLocal(s)
            flow || stuck != null -> turnOn(s)
            s.rules == null -> if (FocusEngine.isParentSessionActive(s.state, Focus.clock(this, s))) turnOn(s) else pinLocal(s)
            askOff -> pinLocal(s)
            else -> home(s)
        }
    }

    // ---- 1. welcome and connect ---------------------------------------------------------------------------------------

    private fun welcome(s: Saved) = page { c ->
        c.addView(Ui.title(this, w("welcome.title")))
        c.addView(Ui.text(this, w("welcome.body")))
        c.addView(Ui.card(this, Ui.PEACH).apply { addView(Ui.text(context, w("welcome.privacy"), 15f)) })
        if (s.removed) c.addView(Ui.text(this, w("home.removed"), bold = true, color = Ui.CORAL_DEEP))
        val card = Ui.card(this)
        card.addView(Ui.text(this, w("connect.title"), 20f, bold = true))
        card.addView(Ui.text(this, w("connect.body")))
        if (Phone.familyInstalled(this)) {
            card.addView(Ui.button(this, w("connect.open")) { message = null; Phone.openFamily(this) })
        } else {
            card.addView(Ui.text(this, w("connect.noFamily"), bold = true))
        }
        card.addView(Ui.button(this, w("perm.listen"), primary = false) { say(w("welcome.body") + " " + w("connect.body")) })
        c.addView(card)
    }

    // ---- 2. the PIN -------------------------------------------------------------------------------------------------

    private fun pinOnline() = page { c ->
        c.addView(Ui.title(this, w("pin.title")).apply { gravity = Gravity.CENTER })
        c.addView(Ui.text(this, w("pin.body")).apply { gravity = Gravity.CENTER })
        val msg = Ui.text(this, "", 16f, color = Ui.CORAL_DEEP)
        c.addView(Ui.pinPad(this, lang, msg, onPin = { pin ->
            background {
                message = when (val r = Focus.checkPinOnline(this, pin)) {
                    Focus.PinOnline.Ok -> null
                    Focus.PinOnline.Wrong -> w("pin.wrong")
                    is Focus.PinOnline.Wait -> w("pin.wait", "m" to r.minutes)
                    Focus.PinOnline.NoPin -> w("pin.noPin")
                    Focus.PinOnline.Offline -> w("pin.offline")
                }
            }
        }, onCancel = null))
    }

    /** The PIN checked on the phone (offline), for every parent action after set-up. */
    private fun pinLocal(s: Saved) = page { c ->
        c.addView(Ui.title(this, w("pin.title")).apply { gravity = Gravity.CENTER })
        val msg = Ui.text(this, "", 16f, color = Ui.CORAL_DEEP)
        c.addView(Ui.pinPad(this, lang, msg, onPin = { pin ->
            var result: PinResult = PinResult.Wrong
            Store.update(this) { cur ->
                val entry = FocusEngine.enterParentPin(cur.state, cur.rules ?: Focus.defaultRules(emptySet()), pin, Focus.clock(this, cur))
                result = entry.result
                cur.copy(state = entry.state)
            }
            when (val r = result) {
                PinResult.Ok -> {
                    if (askOff) {
                        askOff = false
                        Store.update(this) { it.copy(enabled = false) }
                        stopService(android.content.Intent(this, FocusService::class.java))
                    }
                    render()
                }
                PinResult.Wrong -> msg.text = w("pin.wrong")
                is PinResult.Wait -> msg.text = w("pin.wait", "m" to r.minutes)
                PinResult.NeedsNewPin, PinResult.NoPin -> { Store.update(this) { it.copy(state = it.state.copy(pin = it.state.pin.copy(record = null))) }; render() }
            }
        }, onCancel = if (s.rules != null) ({ wantSetup = false; askOff = false; render() }) else null))
    }

    // ---- 3. set-up ----------------------------------------------------------------------------------------------------

    private fun stepCard(c: LinearLayout, title: String, body: String, done: Boolean, onOpen: () -> Unit, extra: ((LinearLayout) -> Unit)? = null) {
        val card = Ui.card(this, if (done) Color.parseColor("#ECFDF5") else Color.WHITE)
        card.addView(Ui.text(this, (if (done) "✓  " else "") + title, 19f, bold = true, color = if (done) Ui.LEAF_DEEP else Ui.SLATE))
        card.addView(Ui.text(this, body, 16f))
        if (!done) {
            card.addView(Ui.button(this, w("perm.open")) { onOpen() })
            card.addView(Ui.button(this, w("perm.listen"), primary = false) { say("$title. $body") })
            extra?.invoke(card)
        }
        c.addView(card)
    }

    private fun stepKey(st: OemStep) = "oem.${st.kind}"

    /** Brands that stop background apps unless allowed; on the others the lock's notification keeps it running. */
    private val KEEP_BRANDS = setOf(Brand.XIAOMI, Brand.VIVO, Brand.OPPO, Brand.REALME, Brand.ONEPLUS, Brand.TRANSSION, Brand.SAMSUNG)

    private fun stepDone(s: Saved, st: OemStep): Boolean =
        stepKey(st) in s.confirmed || (st.kind == StepKind.BATTERY && Phone.ignoresBatteryOptimisation(this))

    private fun setup(s: Saved) = page { c ->
        // The apps: already ticked; the parent changes them only if they want.
        val apps = Phone.apps(this)
        val locked = draftLocked ?: run {
            val r = s.rules
            draftWhatsapp = r?.whatsappOpen ?: true
            r?.schedule?.windows?.firstOrNull()?.let { draftDays = it.days.toMutableSet(); draftStart = it.startMinute; draftEnd = it.endMinute }
            (r?.lockedApps?.toMutableSet() ?: apps.filter { it.suggested }.map { it.pkg }.toMutableSet()).also { draftLocked = it }
        }
        val appsCard = Ui.card(this)
        appsCard.addView(Ui.text(this, w("apps.title"), 20f, bold = true))
        appsCard.addView(Ui.text(this, w("apps.lead"), 15f))
        appsCard.addView(Switch(this).apply {
            text = w("apps.whatsapp"); textSize = 17f; isChecked = draftWhatsapp; minHeight = Ui.dp(context, 56)
            setOnCheckedChangeListener { _, v -> draftWhatsapp = v }
        })
        for (a in apps) {
            appsCard.addView(CheckBox(this).apply {
                text = a.label; textSize = 17f; isChecked = a.pkg in locked; minHeight = Ui.dp(context, 52)
                setOnCheckedChangeListener { _, v -> if (v) locked += a.pkg else locked -= a.pkg }
            })
        }
        c.addView(appsCard)

        // The times: ready-made, Monday to Friday 4 pm to 9 pm.
        val times = Ui.card(this)
        times.addView(Ui.text(this, w("times.title"), 20f, bold = true))
        times.addView(Ui.text(this, w("times.lead"), 15f))
        val days = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (d in 1..7) {
            days.addView(TextView(this).apply {
                text = w("day.$d"); textSize = 15f; gravity = Gravity.CENTER
                fun paint() {
                    val on = d in draftDays
                    setTextColor(if (on) Color.WHITE else Ui.SLATE)
                    setBackgroundColor(if (on) Ui.EMERALD else Ui.OFF_WHITE)
                }
                paint()
                layoutParams = LinearLayout.LayoutParams(0, Ui.dp(context, 48), 1f).apply { setMargins(2, 0, 2, 0) }
                setOnClickListener { if (d in draftDays) draftDays -= d else draftDays += d; paint() }
            })
        }
        times.addView(days)
        fun stepper(label: String, get: () -> Int, set: (Int) -> Unit) {
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val shown = Ui.text(this, "$label  ${Words.clock(lang, get())}", 18f, bold = true).apply { layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f) }
            row.addView(shown)
            row.addView(Ui.button(this, "−", primary = false) { set((get() - 30).coerceAtLeast(0)); shown.text = "$label  ${Words.clock(lang, get())}" }.apply { contentDescription = "$label −"; layoutParams = LinearLayout.LayoutParams(Ui.dp(context, 64), Ui.dp(context, 56)) })
            row.addView(Ui.button(this, "+", primary = false) { set((get() + 30).coerceAtMost(24 * 60)); shown.text = "$label  ${Words.clock(lang, get())}" }.apply { contentDescription = "$label +"; layoutParams = LinearLayout.LayoutParams(Ui.dp(context, 64), Ui.dp(context, 56)).apply { leftMargin = Ui.dp(context, 8) } })
            times.addView(row)
        }
        stepper(w("times.from"), { draftStart }, { draftStart = it.coerceAtMost(draftEnd - 30) })
        stepper(w("times.to"), { draftEnd }, { draftEnd = it.coerceAtLeast(draftStart + 30) })
        c.addView(times)

        if (s.rules == null) {
            // First set-up: the choices are kept, then the switches (Turn on).
            c.addView(Ui.button(this, w("turn.button")) { wantSetup = false; flow = true; lastAsked = null; advance() })
        } else {
            c.addView(Ui.button(this, w("save")) { startWith(locked, turnOn = s.enabled) })
        }
    }

    // ---- 3. turn on: the phone's own switches, one after another ------------------------------------------------------

    private fun nextNeeded(): String? = when {
        Build.VERSION.SDK_INT >= 33 && !Phone.hasNotifications(this) && !notifyAsked -> "notify"
        !Phone.hasOverlay(this) -> "overlay"
        !Phone.hasUsageAccess(this) -> "usage"
        else -> null
    }

    private fun stepWords(need: String): Pair<String, String> = when (need) {
        "notify" -> w("perm.notify.t") to w("perm.notify.b")
        "overlay" -> w("perm.overlay.t") to w("perm.overlay.b")
        else -> w("perm.usage.t") to w("perm.usage.b")
    }

    private fun advance() {
        val need = nextNeeded()
        if (need == null) {
            flow = false
            stuck = null
            lastAsked = null
            finishTurnOn()
            return
        }
        if (need == lastAsked) {
            // Back without switching it on: stop and help, never a loop of the same screen.
            flow = false
            stuck = need
            lastAsked = null
            render()
            say(w("stuck.title") + ". " + w("stuck.body"))
            return
        }
        lastAsked = need
        stuck = null
        render()
        say(stepWords(need).second)
        when (need) {
            "notify" -> { notifyAsked = true; requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1) }
            "overlay" -> Phone.openOverlay(this)
            else -> Phone.openUsageAccess(this)
        }
    }

    private fun finishTurnOn() {
        val cur = Store.get(this)
        if (cur.rules != null) {
            // Switches fixed after the lock was set up: it carries on as it was.
            if (cur.enabled) FocusService.start(this)
            render()
            return
        }
        val locked = draftLocked ?: Phone.apps(this).filter { it.suggested }.map { it.pkg }.toMutableSet()
        startWith(locked, turnOn = true)
    }

    private fun turnOn(s: Saved) = page { c ->
        val need = stuck
        when {
            need != null -> {
                c.addView(Ui.title(this, w("stuck.title")))
                c.addView(Ui.text(this, stepWords(need).first, 19f, bold = true))
                c.addView(Ui.text(this, w("stuck.body")))
                c.addView(Ui.button(this, w("stuck.retry")) { stuck = null; flow = true; lastAsked = null; advance() })
                if (need != "notify" && Phone.restrictedSettingsLikely(this)) {
                    val card = Ui.card(this, Ui.PEACH)
                    card.addView(Ui.text(this, w("stuck.denied"), 17f))
                    card.addView(Ui.button(this, w("stuck.appInfo"), primary = false) { Phone.openAppInfo(this) })
                    c.addView(card)
                }
                c.addView(Ui.button(this, w("perm.listen"), primary = false) { say(w("stuck.body") + " " + w("stuck.denied")) })
            }
            flow && lastAsked != null -> {
                val (t, b) = stepWords(lastAsked!!)
                c.addView(Ui.title(this, t))
                c.addView(Ui.text(this, b))
                c.addView(Ui.button(this, w("perm.open")) { lastAsked = null; advance() })
            }
            else -> {
                c.addView(Ui.title(this, w("turn.title")))
                c.addView(Ui.text(this, w("turn.lead")))
                c.addView(Ui.button(this, w("turn.button")) { flow = true; lastAsked = null; advance() })
                c.addView(Ui.button(this, w("perm.listen"), primary = false) { say(w("turn.title") + ". " + w("turn.lead")) })
                if (s.rules == null) c.addView(Ui.button(this, w("turn.choose"), primary = false) { wantSetup = true; render() })
                c.addView(Ui.card(this, Ui.PEACH).apply { addView(Ui.text(context, w("welcome.privacy"), 15f)) })
            }
        }
    }

    private fun startWith(locked: Set<String>, turnOn: Boolean) {
        val cur = Store.get(this)
        val device = Phone.devicePackages(this)
        val clean = locked - device.alwaysOpen - device.lockedInLockTime - device.ownPackage
        val rules = FocusRules(
            lockedApps = clean,
            schedule = LockSchedule(listOf(LockWindow(draftDays.toSet().ifEmpty { LockWindow.WEEKDAYS }, draftStart, draftEnd))),
            educationalApps = cur.rules?.educationalApps ?: emptySet(),
            whatsappOpen = draftWhatsapp,
            parentSessionMinutes = cur.rules?.parentSessionMinutes ?: FocusRules.DEFAULT_PARENT_SESSION_MINUTES,
            doneLimitMinutes = cur.rules?.doneLimitMinutes,
        )
        when (val r = FocusEngine.changeRules(cur.state, rules, device, Focus.clock(this, cur))) {
            is RulesChange.Accepted -> {
                // The phone goes back to the child locked: the parent session ends at Start.
                Store.update(this) { it.copy(rules = r.rules, state = FocusEngine.endParentSession(it.state)) }
                wantSetup = false
                message = null
                if (turnOn) Focus.startLock(this) else if (Store.get(this).enabled) FocusService.start(this)
                render()
            }
            RulesChange.NeedsParentPin -> render()
            is RulesChange.Invalid -> { message = w(if (com.netcyberai.family.focus.RuleProblem.NO_LOCKED_APPS in r.problems) "apps.none" else "times.bad"); render() }
        }
    }

    // ---- 4. home ------------------------------------------------------------------------------------------------------

    private fun home(s: Saved) = page { c ->
        val rules = s.rules ?: return@page
        val ok = Phone.lockPermissionsOk(this)
        c.addView(Ui.title(this, if (s.enabled) w("home.on") else w("home.offTitle")))
        val win = rules.schedule.windows.firstOrNull()
        if (win != null) {
            val days = (1..7).filter { it in win.days }.joinToString(", ") { w("day.$it") }
            c.addView(Ui.text(this, w("home.times", "days" to days, "from" to Words.clock(lang, win.startMinute), "to" to Words.clock(lang, win.endMinute))))
        }
        if (s.enabled && !ok) {
            c.addView(Ui.button(this, w("home.permLost")) { flow = true; lastAsked = null; advance() })
        }
        val card = Ui.card(this)
        val status = s.state.status
        val clock = Focus.clock(this, s)
        if (status == null) card.addView(Ui.text(this, w("home.unknown")))
        else for (ch in status.children) {
            val done = FocusEngine.isDoneToday(s.state, ch.childId, clock) || ch.planDone
            card.addView(Ui.text(this, if (done) w("home.done", "name" to ch.name) else w("home.pending", "name" to ch.name, "n" to ch.pending.size), 18f, bold = true, color = if (done) Ui.LEAF_DEEP else Ui.SLATE))
        }
        c.addView(card)
        val parent = s.state.parentSession
        if (parent != null && parent.isActive(clock.epochMillis)) {
            val minute = com.netcyberai.family.focus.IndiaTime.at(parent.endsAtMillis).minuteOfDay
            c.addView(Ui.text(this, w("home.parentOn", "time" to Words.clock(lang, minute)), bold = true, color = Ui.EMERALD))
            c.addView(Ui.button(this, w("home.lockNow")) { Store.update(this) { it.copy(state = FocusEngine.endParentSession(it.state)) }; render() })
        }
        // The brand's own steps (budget brands stop background apps): recommended, never in the way of turning it on.
        val brand = Phone.brand
        val todo = OemGuide.steps(brand).filter { !stepDone(s, it) && brand in KEEP_BRANDS }
        if (s.enabled && todo.isNotEmpty()) {
            val keep = Ui.card(this, Ui.PEACH)
            keep.addView(Ui.text(this, w("keep.title"), 19f, bold = true))
            keep.addView(Ui.text(this, w("keep.lead"), 15f))
            c.addView(keep)
            for (st in todo) {
                stepCard(c, Words.stepTitle(lang, st.kind), Words.stepBody(lang, st.kind, brand, Phone.hasOwnScreen(this, st)), false, onOpen = { Phone.openStep(this, st) }) { card ->
                    card.addView(Ui.button(this, w("perm.confirm"), primary = false) { Store.update(this) { it.copy(confirmed = it.confirmed + stepKey(st)) }; render() })
                }
            }
        }
        c.addView(Ui.button(this, w("home.refresh"), primary = false) { background { Focus.refreshStatus(this) } })
        c.addView(Ui.button(this, w("home.change"), primary = false) { wantSetup = true; draftLocked = null; render() })
        if (s.enabled) c.addView(Ui.button(this, w("home.turnOff"), primary = false) { askOff = true; render() })
        else c.addView(Ui.button(this, w("home.turnOn")) { Focus.startLock(this); render() })
        c.addView(Ui.card(this, Ui.PEACH).apply { addView(Ui.text(context, w("welcome.privacy"), 15f)) })
        c.addView(View(this))
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // Allowed or not, onResume carries on (the dialog paused this screen): the notification is asked for, never in the
        // way of the lock.
        if (!flow) render()
    }
}
