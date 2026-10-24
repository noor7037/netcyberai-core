package com.netcyberai.family.focus

import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

// The parent PIN on the phone (docs/34 §9.1 rules 1, 7 and 8; C304 "the PIN works offline").
// - At set-up the PIN is checked once against the server (M2b-4); the phone then keeps only its own salted PBKDF2 hash
//   and the server's PIN version, inside the encrypted rules. The PIN itself is never stored or shown.
// - When the server's PIN version changes (a reset by the parent's email code, M1), the stored hash is stale: the lock
//   asks for the new PIN, checked against the server again.
// - Wrong PINs: five tries, then waits of 1, 5, 15 and then 60 minutes for every further wrong try, as the server does
//   (src/lib/family/pin.ts waitAfter). No hints. A PIN entered during a wait is not checked and not counted.

/** PBKDF2 with HMAC-SHA256 (RFC 8018), on javax.crypto.Mac so it runs on every Android version the app supports. */
object Pbkdf2 {
    fun sha256(password: ByteArray, salt: ByteArray, iterations: Int, keyLength: Int): ByteArray {
        require(password.isNotEmpty()) { "empty password" }
        require(iterations >= 1 && keyLength >= 1)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(password, "HmacSHA256"))
        val hLen = mac.macLength
        val blocks = (keyLength + hLen - 1) / hLen
        val out = ByteArray(keyLength)
        for (i in 1..blocks) {
            mac.update(salt)
            mac.update(byteArrayOf((i ushr 24).toByte(), (i ushr 16).toByte(), (i ushr 8).toByte(), i.toByte()))
            var u = mac.doFinal()
            val t = u.copyOf()
            for (j in 2..iterations) {
                u = mac.doFinal(u)
                for (k in t.indices) t[k] = (t[k].toInt() xor u[k].toInt()).toByte()
            }
            val offset = (i - 1) * hLen
            System.arraycopy(t, 0, out, offset, minOf(hLen, keyLength - offset))
        }
        return out
    }
}

object PinHasher {
    const val SCHEME = "pbkdf2-sha256"
    const val ITERATIONS = 100_000
    private const val SALT_BYTES = 16
    private const val HASH_BYTES = 32
    private const val MAX_ITERATIONS = 10_000_000

    /** Six ASCII digits, the parent PIN's only form (M1). */
    fun isWellFormed(pin: String): Boolean = pin.length == 6 && pin.all { it in '0'..'9' }

    /** "pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>", with a fresh random salt each time. */
    fun hash(pin: String, random: SecureRandom = SecureRandom(), iterations: Int = ITERATIONS): String {
        require(isWellFormed(pin)) { "a PIN is six digits" }
        val salt = ByteArray(SALT_BYTES).also { random.nextBytes(it) }
        val hash = Pbkdf2.sha256(pin.toByteArray(Charsets.US_ASCII), salt, iterations, HASH_BYTES)
        return listOf(SCHEME, iterations.toString(), hex(salt), hex(hash)).joinToString("$")
    }

    /** Whether [pin] is the PIN behind [stored]; false for anything malformed. Compares in constant time. */
    fun matches(stored: String, pin: String): Boolean {
        if (!isWellFormed(pin)) return false
        val parts = stored.split('$')
        if (parts.size != 4 || parts[0] != SCHEME) return false
        val iterations = parts[1].toIntOrNull() ?: return false
        if (iterations !in 1..MAX_ITERATIONS) return false
        val salt = unhex(parts[2]) ?: return false
        val want = unhex(parts[3]) ?: return false
        if (salt.isEmpty() || want.isEmpty()) return false
        val got = Pbkdf2.sha256(pin.toByteArray(Charsets.US_ASCII), salt, iterations, want.size)
        var diff = 0
        for (i in want.indices) diff = diff or (want[i].toInt() xor got[i].toInt())
        return diff == 0
    }

    private fun hex(bytes: ByteArray): String {
        val digits = "0123456789abcdef"
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) sb.append(digits[(b.toInt() shr 4) and 0xf]).append(digits[b.toInt() and 0xf])
        return sb.toString()
    }

    private fun unhex(text: String): ByteArray? {
        if (text.length % 2 != 0) return null
        val out = ByteArray(text.length / 2)
        for (i in out.indices) {
            val hi = Character.digit(text[2 * i], 16)
            val lo = Character.digit(text[2 * i + 1], 16)
            if (hi < 0 || lo < 0) return null
            out[i] = ((hi shl 4) or lo).toByte()
        }
        return out
    }
}

/** The PIN as the phone keeps it. Its text form never shows the hash, so a log line cannot leak it. */
class PinRecord(val hash: String, val version: String) {
    override fun equals(other: Any?): Boolean = other is PinRecord && other.hash == hash && other.version == version
    override fun hashCode(): Int = 31 * hash.hashCode() + version.hashCode()
    override fun toString(): String = "PinRecord(version=$version, hash=<hidden>)"
}

/** The PIN and its wrong-try count; [waitUntilMillis] is lock time (TrustedClock), so a restart does not clear it. */
data class PinState(val record: PinRecord?, val failures: Int = 0, val waitUntilMillis: Long = 0)

sealed class PinResult {
    data object Ok : PinResult()

    /** Wrong, with no hint of any kind. */
    data object Wrong : PinResult()

    /** Too many wrong tries: wait this many minutes (rounded up) before the next try is checked. */
    data class Wait(val minutes: Int) : PinResult()

    /** The parent reset the PIN on the server; the new one has to be entered and checked online. */
    data object NeedsNewPin : PinResult()

    /** No PIN on this phone yet (set-up not done). */
    data object NoPin : PinResult()
}

data class PinCheck(val state: PinState, val result: PinResult)

object PinGuard {
    const val FREE_TRIES = 5
    val WAIT_MINUTES: List<Int> = listOf(1, 5, 15, 60)

    /** How long to wait after this many wrong tries in a row (0 while tries are free). */
    fun waitAfter(failures: Int): Long {
        if (failures < FREE_TRIES) return 0
        return WAIT_MINUTES[minOf(failures - FREE_TRIES, WAIT_MINUTES.size - 1)] * MINUTE_MILLIS
    }

    /** The PIN after the server confirmed it (set-up, or a new PIN after a reset): wrong tries start again. */
    fun install(pin: String, version: String, random: SecureRandom = SecureRandom()): PinState =
        PinState(PinRecord(PinHasher.hash(pin, random), version))

    /**
     * Checks [pin] at [nowMillis] (lock time). [serverPinVersion] is the PIN version in the latest status reply, or null
     * before there is one.
     */
    fun check(state: PinState, pin: String, serverPinVersion: String?, nowMillis: Long): PinCheck {
        val record = state.record ?: return PinCheck(state, PinResult.NoPin)
        if (serverPinVersion != null && serverPinVersion != record.version) return PinCheck(state, PinResult.NeedsNewPin)
        if (nowMillis < state.waitUntilMillis) return PinCheck(state, PinResult.Wait(minutesLeft(state.waitUntilMillis - nowMillis)))
        if (PinHasher.matches(record.hash, pin)) return PinCheck(state.copy(failures = 0, waitUntilMillis = 0), PinResult.Ok)
        val failures = minOf(state.failures + 1, 1_000)
        val wait = waitAfter(failures)
        val next = state.copy(failures = failures, waitUntilMillis = if (wait > 0) nowMillis + wait else 0)
        return PinCheck(next, if (wait > 0) PinResult.Wait(minutesLeft(wait)) else PinResult.Wrong)
    }

    private fun minutesLeft(millis: Long): Int = ((millis + MINUTE_MILLIS - 1) / MINUTE_MILLIS).toInt()
}
