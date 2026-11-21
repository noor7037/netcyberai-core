package com.netcyberai.focus

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView

// Plain views in the logo's colours (src/lib/design-tokens.ts; the Family app's look, no dark blue): large text and
// buttons at least 56 dp tall for parents with little reading and small phones.
object Ui {
    val EMERALD = Color.parseColor("#0F766E")
    val SLATE = Color.parseColor("#1E293B")
    val OFF_WHITE = Color.parseColor("#F9FAFB")
    val CORAL_DEEP = Color.parseColor("#B91C1C")
    val LEAF_DEEP = Color.parseColor("#15803D")
    val PEACH = Color.parseColor("#FFF1E6")
    val MUTED = Color.parseColor("#475569")

    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()

    fun column(ctx: Context, padDp: Int = 20): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val p = dp(ctx, padDp)
        setPadding(p, p, p, p)
    }

    fun card(ctx: Context, color: Int = Color.WHITE): LinearLayout = column(ctx, 16).apply {
        background = GradientDrawable().apply { cornerRadius = dp(ctx, 16).toFloat(); setColor(color) }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 12) }
    }

    fun text(ctx: Context, s: String, sizeSp: Float = 17f, bold: Boolean = false, color: Int = SLATE): TextView = TextView(ctx).apply {
        text = s
        textSize = sizeSp
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        setLineSpacing(0f, 1.2f)
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 8) }
    }

    fun title(ctx: Context, s: String): TextView = text(ctx, s, 24f, bold = true)

    fun button(ctx: Context, s: String, primary: Boolean = true, onClick: () -> Unit): Button = Button(ctx).apply {
        text = s
        isAllCaps = false
        textSize = 18f
        minHeight = dp(ctx, 56)
        setTextColor(if (primary) Color.WHITE else EMERALD)
        background = GradientDrawable().apply {
            cornerRadius = dp(ctx, 28).toFloat()
            setColor(if (primary) EMERALD else Color.WHITE)
            if (!primary) setStroke(dp(ctx, 2), EMERALD)
        }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 12) }
        setOnClickListener { onClick() }
    }

    /**
     * A 6-digit PIN pad with its own keys (no keyboard, so nothing is suggested or remembered). The digits are never
     * shown, only dots.
     */
    fun pinPad(ctx: Context, lang: String, message: TextView, onPin: (String) -> Unit, onCancel: (() -> Unit)?): LinearLayout {
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val dots = text(ctx, "○ ○ ○ ○ ○ ○", 30f, bold = true).apply { gravity = Gravity.CENTER; contentDescription = "" }
        val typed = StringBuilder()
        fun redraw() { dots.text = (0 until 6).joinToString(" ") { if (it < typed.length) "●" else "○" } }
        box.addView(dots)
        box.addView(message.apply { gravity = Gravity.CENTER })
        val grid = GridLayout(ctx).apply { columnCount = 3 }
        val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "")
        for (k in keys) {
            val b = Button(ctx).apply {
                text = k
                textSize = 26f
                isAllCaps = false
                setTextColor(SLATE)
                contentDescription = if (k == "⌫") Words.t(lang, "pin.delete") else k
                background = GradientDrawable().apply { cornerRadius = dp(ctx, 40).toFloat(); setColor(if (k.isEmpty()) Color.TRANSPARENT else OFF_WHITE) }
                isEnabled = k.isNotEmpty()
                layoutParams = GridLayout.LayoutParams().apply { width = dp(ctx, 80); height = dp(ctx, 72); setMargins(dp(ctx, 8), dp(ctx, 6), dp(ctx, 8), dp(ctx, 6)) }
                setOnClickListener {
                    when {
                        k == "⌫" -> if (typed.isNotEmpty()) typed.deleteCharAt(typed.length - 1)
                        typed.length < 6 -> typed.append(k)
                    }
                    redraw()
                    if (typed.length == 6) {
                        val pin = typed.toString()
                        typed.clear()
                        redraw()
                        onPin(pin)
                    }
                }
            }
            grid.addView(b)
        }
        box.addView(grid)
        if (onCancel != null) box.addView(button(ctx, Words.t(lang, "pin.cancel"), primary = false) { onCancel() })
        return box
    }

    fun gap(ctx: Context, h: Int = 16): View = View(ctx).apply { layoutParams = LinearLayout.LayoutParams(1, dp(ctx, h)) }
}
