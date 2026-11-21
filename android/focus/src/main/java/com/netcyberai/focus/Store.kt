package com.netcyberai.focus

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.netcyberai.family.focus.ChildStatus
import com.netcyberai.family.focus.ClockAnchor
import com.netcyberai.family.focus.FocusRules
import com.netcyberai.family.focus.FocusState
import com.netcyberai.family.focus.FocusStatus
import com.netcyberai.family.focus.IndiaDate
import com.netcyberai.family.focus.LockSchedule
import com.netcyberai.family.focus.LockWindow
import com.netcyberai.family.focus.ParentSession
import com.netcyberai.family.focus.PendingItem
import com.netcyberai.family.focus.PinRecord
import com.netcyberai.family.focus.PinState
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

// Everything the Focus app keeps (C304, C538), in one file encrypted with a key held in the Android Keystore: the
// family session, the rules, the PIN's salted hash and the lock's state. Nothing here leaves the phone.
data class Saved(
    val lang: String,
    val deviceId: String,
    val session: String? = null,
    /** A pass the Family app handed over, until it is traded for a session. */
    val pass: String? = null,
    val rules: FocusRules? = null,
    /** The parent pressed Start (and has not switched the lock off with the PIN). */
    val enabled: Boolean = false,
    /** Brand steps the phone cannot read back, confirmed by the parent ("I have done it"). */
    val confirmed: Set<String> = emptySet(),
    val state: FocusState = FocusState(),
    val anchor: ClockAnchor? = null,
    val floorMillis: Long? = null,
    /** The server said the phone is no longer set up, or the session ended: connect again. */
    val removed: Boolean = false,
)

object Store {
    private const val FILE = "focus.bin"
    private const val KEY = "netcyberai-focus-store"

    @Volatile private var cached: Saved? = null

    @Synchronized
    fun get(ctx: Context): Saved {
        cached?.let { return it }
        val loaded = read(ctx) ?: Saved(lang = defaultLang(), deviceId = newDeviceId())
        cached = loaded
        if (!File(ctx.filesDir, FILE).exists()) write(ctx, loaded)
        return loaded
    }

    @Synchronized
    fun update(ctx: Context, change: (Saved) -> Saved): Saved {
        val next = change(get(ctx))
        cached = next
        write(ctx, next)
        return next
    }

    /** Keeps a change in memory only (the lock's frequent small changes); [flush] writes it. */
    @Synchronized
    fun touch(ctx: Context, change: (Saved) -> Saved): Saved {
        val next = change(get(ctx))
        cached = next
        return next
    }

    @Synchronized
    fun flush(ctx: Context) {
        cached?.let { write(ctx, it) }
    }

    private fun defaultLang(): String = if (java.util.Locale.getDefault().language == "hi") "hi" else "en"

    private fun newDeviceId(): String {
        val b = ByteArray(32)
        SecureRandom().nextBytes(b)
        return android.util.Base64.encodeToString(b, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
    }

    // ---- encryption ---------------------------------------------------------------------------------------------

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private fun write(ctx: Context, s: Saved) {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val data = c.doFinal(toJson(s).toString().toByteArray(Charsets.UTF_8))
        val iv = c.iv
        val tmp = File(ctx.filesDir, "$FILE.tmp")
        tmp.writeBytes(byteArrayOf(iv.size.toByte()) + iv + data)
        tmp.renameTo(File(ctx.filesDir, FILE))
    }

    private fun read(ctx: Context): Saved? {
        val f = File(ctx.filesDir, FILE)
        if (!f.exists()) return null
        return try {
            val bytes = f.readBytes()
            val n = bytes[0].toInt()
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 1 + n)))
            fromJson(JSONObject(String(c.doFinal(bytes.copyOfRange(1 + n, bytes.size)), Charsets.UTF_8)))
        } catch (e: Exception) {
            // A file that cannot be read (a restored backup, a lost key): start again; the parent connects again.
            null
        }
    }

    // ---- JSON -----------------------------------------------------------------------------------------------------

    private fun strings(a: JSONArray?): Set<String> = (0 until (a?.length() ?: 0)).map { a!!.getString(it) }.toSet()
    private fun JSONObject.str(k: String): String? = if (has(k) && !isNull(k)) getString(k) else null
    private fun JSONObject.lng(k: String): Long? = if (has(k) && !isNull(k)) getLong(k) else null

    fun rulesJson(r: FocusRules): JSONObject = JSONObject()
        .put("locked", JSONArray(r.lockedApps.toList()))
        .put("edu", JSONArray(r.educationalApps.toList()))
        .put("whatsapp", r.whatsappOpen)
        .put("parentMinutes", r.parentSessionMinutes)
        .put("doneLimit", r.doneLimitMinutes ?: JSONObject.NULL)
        .put("windows", JSONArray(r.schedule.windows.map { JSONObject().put("days", JSONArray(it.days.toList())).put("start", it.startMinute).put("end", it.endMinute) }))

    fun rulesFrom(o: JSONObject): FocusRules {
        val w = o.getJSONArray("windows")
        val windows = (0 until w.length()).map { i ->
            val x = w.getJSONObject(i)
            val d = x.getJSONArray("days")
            LockWindow((0 until d.length()).map { d.getInt(it) }.toSet(), x.getInt("start"), x.getInt("end"))
        }
        return FocusRules(
            lockedApps = strings(o.optJSONArray("locked")),
            schedule = LockSchedule(windows),
            educationalApps = strings(o.optJSONArray("edu")),
            whatsappOpen = o.optBoolean("whatsapp", true),
            parentSessionMinutes = o.optInt("parentMinutes", FocusRules.DEFAULT_PARENT_SESSION_MINUTES),
            doneLimitMinutes = if (o.isNull("doneLimit")) null else o.getInt("doneLimit"),
        )
    }

    fun statusJson(s: FocusStatus): JSONObject = JSONObject()
        .put("day", s.indiaDate.toString())
        .put("pinVersion", s.pinVersion)
        .put("children", JSONArray(s.children.map { c ->
            JSONObject().put("childId", c.childId).put("firstName", c.name).put("done", c.planDone)
                .put("pending", JSONArray(c.pending.map { JSONObject().put("key", it.key).put("title", it.title) }))
        }))

    /** The server's status reply (M2b-1), or a saved one; null when it is not one. */
    fun statusFrom(o: JSONObject): FocusStatus? {
        val day = IndiaDate.parse(o.optString("day")) ?: return null
        val a = o.optJSONArray("children") ?: return null
        val children = (0 until a.length()).map { i ->
            val c = a.getJSONObject(i)
            val p = c.optJSONArray("pending") ?: JSONArray()
            ChildStatus(
                childId = c.getString("childId"),
                name = c.optString("firstName"),
                planDone = c.optBoolean("done", false),
                pending = (0 until p.length()).map { j -> p.getJSONObject(j).let { PendingItem(it.optString("key"), it.optString("title")) } },
            )
        }
        return FocusStatus(day, children, o.str("pinVersion") ?: "")
    }

    private fun toJson(s: Saved): JSONObject {
        val st = s.state
        return JSONObject()
            .put("lang", s.lang)
            .put("deviceId", s.deviceId)
            .put("session", s.session ?: JSONObject.NULL)
            .put("pass", s.pass ?: JSONObject.NULL)
            .put("rules", s.rules?.let { rulesJson(it) } ?: JSONObject.NULL)
            .put("enabled", s.enabled)
            .put("removed", s.removed)
            .put("confirmed", JSONArray(s.confirmed.toList()))
            .put("anchor", s.anchor?.let { JSONObject().put("server", it.serverMillis).put("elapsed", it.elapsedMillis).put("wall", it.wallMillis).put("boot", it.bootId) } ?: JSONObject.NULL)
            .put("floor", s.floorMillis ?: JSONObject.NULL)
            .put("status", st.status?.let { statusJson(it) } ?: JSONObject.NULL)
            .put("doneOn", JSONObject(st.doneOn.mapValues { it.value.toString() }))
            .put("usageDate", st.usageDate?.toString() ?: JSONObject.NULL)
            .put("used", JSONObject(st.usedAfterDoneMillis))
            .put("parent", st.parentSession?.let { JSONObject().put("start", it.startedAtMillis).put("end", it.endsAtMillis) } ?: JSONObject.NULL)
            .put("childInUse", st.childInUse ?: JSONObject.NULL)
            .put("pinHash", st.pin.record?.hash ?: JSONObject.NULL)
            .put("pinVersion", st.pin.record?.version ?: JSONObject.NULL)
            .put("pinFailures", st.pin.failures)
            .put("pinWait", st.pin.waitUntilMillis)
    }

    private fun fromJson(o: JSONObject): Saved {
        val doneOn = o.optJSONObject("doneOn")?.let { d -> d.keys().asSequence().mapNotNull { k -> IndiaDate.parse(d.getString(k))?.let { k to it } }.toMap() } ?: emptyMap()
        val used = o.optJSONObject("used")?.let { u -> u.keys().asSequence().associateWith { u.getLong(it) } } ?: emptyMap()
        val anchor = o.optJSONObject("anchor")?.let { ClockAnchor(it.getLong("server"), it.getLong("elapsed"), it.getLong("wall"), it.getString("boot")) }
        val parent = o.optJSONObject("parent")?.let { ParentSession(it.getLong("start"), it.getLong("end")) }
        val hash = o.str("pinHash")
        val version = o.str("pinVersion")
        val state = FocusState(
            status = o.optJSONObject("status")?.let { statusFrom(it) },
            doneOn = doneOn,
            usageDate = o.str("usageDate")?.let { IndiaDate.parse(it) },
            usedAfterDoneMillis = used,
            parentSession = parent,
            childInUse = o.str("childInUse"),
            pin = PinState(if (hash != null && version != null) PinRecord(hash, version) else null, o.optInt("pinFailures", 0), o.optLong("pinWait", 0)),
        )
        return Saved(
            lang = o.optString("lang", "en"),
            deviceId = o.getString("deviceId"),
            session = o.str("session"),
            pass = o.str("pass"),
            rules = o.optJSONObject("rules")?.let { rulesFrom(it) },
            enabled = o.optBoolean("enabled", false),
            removed = o.optBoolean("removed", false),
            confirmed = strings(o.optJSONArray("confirmed")),
            state = state,
            anchor = anchor,
            floorMillis = o.lng("floor"),
        )
    }
}
