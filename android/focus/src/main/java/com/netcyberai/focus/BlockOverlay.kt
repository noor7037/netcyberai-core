package com.netcyberai.focus

import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import com.netcyberai.family.focus.BlockReason
import com.netcyberai.family.focus.Decision
import com.netcyberai.family.focus.FocusEngine
import com.netcyberai.family.focus.PinResult

// The block screen (docs/34 §9.1 rules 3, 6, 7, 8; C538), drawn over a locked app: what is still pending today with a
// button straight to study, "Who is using the phone?" on a shared phone, and the parent PIN. Back and "Go back" go to
// the home screen. It is never shown over the calling apps, the home screen or our two apps (the rule engine).
class BlockOverlay(private val ctx: Context, private val onChange: () -> Unit) {
    private val wm: WindowManager = ctx.getSystemService(WindowManager::class.java)!!
    private var root: ScrollView? = null
    private var shown: String? = null
    private var typingPin = false

    fun hide() {
        root?.let { runCatching { wm.removeView(it) } }
        root = null
        shown = null
        typingPin = false
    }

    fun show(d: Decision.Blocked, lang: String) {
        val key = "${d.reason}|${d.childId}|${d.pendingIsCurrent}|${d.pending.joinToString { it.key }}|${d.children.joinToString { it.childId }}|$lang"
        if (root != null && (typingPin || key == shown)) return
        val view = root ?: ScrollView(ctx).also { sv ->
            sv.isFocusableInTouchMode = true
            sv.setBackgroundColor(Ui.OFF_WHITE)
            sv.setOnKeyListener { _, code, ev ->
                if (code == KeyEvent.KEYCODE_BACK && ev.action == KeyEvent.ACTION_UP) { goHome(); true } else code == KeyEvent.KEYCODE_BACK
            }
            val type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.OPAQUE,
            )
            lp.gravity = Gravity.TOP
            try {
                wm.addView(sv, lp)
            } catch (e: Exception) {
                // No "display over other apps": the service reports it and the notification asks to fix it.
                return
            }
            root = sv
        }
        shown = key
        view.removeAllViews()
        view.addView(content(d, lang))
        view.requestFocus()
    }

    private fun goHome() {
        Phone.openHome(ctx)
        hide()
    }

    private fun nameOf(childId: String?): String? =
        childId?.let { id -> Store.get(ctx).state.status?.children?.firstOrNull { it.childId == id }?.name?.takeIf { it.isNotBlank() } }

    private fun content(d: Decision.Blocked, lang: String): View {
        val col = Ui.column(ctx, 24)
        col.gravity = Gravity.CENTER_HORIZONTAL
        col.addView(Ui.gap(ctx, 32))
        when (d.reason) {
            BlockReason.PLAN_NOT_DONE -> {
                val name = nameOf(d.childId)
                col.addView(Ui.title(ctx, if (name != null) Words.t(lang, "block.studyName", "name" to name) else Words.t(lang, "block.study")))
                col.addView(Ui.text(ctx, Words.t(lang, "block.studyBody")))
                if (d.pendingIsCurrent && d.pending.isNotEmpty()) {
                    val card = Ui.card(ctx)
                    card.addView(Ui.text(ctx, Words.t(lang, "block.left"), bold = true))
                    for (p in d.pending.take(6)) card.addView(Ui.text(ctx, "•  ${p.title}"))
                    col.addView(card)
                } else if (!d.pendingIsCurrent) {
                    col.addView(Ui.text(ctx, Words.t(lang, "block.offline"), color = Ui.MUTED))
                }
                col.addView(Ui.button(ctx, Words.t(lang, "block.start")) { Phone.openFamily(ctx); hide() })
            }
            BlockReason.CHOOSE_CHILD -> {
                col.addView(Ui.title(ctx, Words.t(lang, "block.choose")))
                for (c in d.children) {
                    col.addView(Ui.button(ctx, c.name, primary = false) {
                        Store.update(ctx) { it.copy(state = FocusEngine.chooseChild(it.state, c.childId)) }
                        shown = null
                        onChange()
                    })
                }
            }
            BlockReason.DONE_LIMIT_REACHED -> {
                col.addView(Ui.title(ctx, Words.t(lang, "block.limit")))
                col.addView(Ui.text(ctx, Words.t(lang, "block.limitBody")))
            }
            BlockReason.PIN_REQUIRED -> {
                col.addView(Ui.title(ctx, Words.t(lang, "block.settings")))
                col.addView(Ui.text(ctx, Words.t(lang, "block.settingsBody")))
            }
        }
        col.addView(Ui.button(ctx, Words.t(lang, "block.pin"), primary = false) { pinView(lang) })
        col.addView(Ui.button(ctx, Words.t(lang, "block.home"), primary = false) { goHome() })
        return col
    }

    private fun pinView(lang: String) {
        val view = root ?: return
        typingPin = true
        val col = Ui.column(ctx, 24)
        col.gravity = Gravity.CENTER_HORIZONTAL
        col.addView(Ui.gap(ctx, 24))
        col.addView(Ui.title(ctx, Words.t(lang, "block.pin")).apply { gravity = Gravity.CENTER })
        val message = Ui.text(ctx, "", 16f, color = Ui.CORAL_DEEP)
        col.addView(Ui.pinPad(ctx, lang, message, onPin = { pin ->
            var result: PinResult = PinResult.Wrong
            Store.update(ctx) { s ->
                val rules = s.rules ?: return@update s
                val entry = FocusEngine.enterParentPin(s.state, rules, pin, Focus.clock(ctx, s))
                result = entry.result
                s.copy(state = entry.state)
            }
            when (val r = result) {
                PinResult.Ok -> { hide(); onChange() }
                PinResult.Wrong -> message.text = Words.t(lang, "pin.wrong")
                is PinResult.Wait -> message.text = Words.t(lang, "pin.wait", "m" to r.minutes)
                PinResult.NeedsNewPin, PinResult.NoPin -> message.text = Words.t(lang, "pin.needNew")
            }
        }, onCancel = {
            typingPin = false
            shown = null
            onChange()
        }))
        view.removeAllViews()
        view.addView(col, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
}
