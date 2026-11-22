package com.netcyberai.focus

import com.netcyberai.family.focus.FocusOutbound
import com.netcyberai.family.focus.FocusOutbound.Endpoint
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

// The Focus app's only HTTP client (C304, C538): every request is one of FocusOutbound's four, to its one host, with its
// fixed body. A renewed session cookie from the server is kept.
object Api {
    /** code 0: no answer (offline). [serverMillis]: the server's clock (its Date header), for the lock's clock. */
    class Reply(val code: Int, val body: JSONObject, val serverMillis: Long?, val renewedSession: String?)

    private fun call(e: Endpoint, deviceId: String, session: String?, body: String?): Reply {
        if (!FocusOutbound.isDeviceId(deviceId)) return Reply(0, JSONObject(), null, null)
        return try {
            val c = URL(FocusOutbound.url(e)).openConnection() as HttpURLConnection
            c.requestMethod = e.method
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            c.useCaches = false
            c.instanceFollowRedirects = false
            c.setRequestProperty("user-agent", "NetCyberAIFocus/${BuildConfigLite.VERSION}")
            c.setRequestProperty(FocusOutbound.DEVICE_HEADER, deviceId)
            if (session != null) c.setRequestProperty("cookie", "${FocusOutbound.SESSION_COOKIE}=$session")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("content-type", "application/json")
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
            val renewed = c.headerFields["Set-Cookie"].orEmpty().plus(c.headerFields["set-cookie"].orEmpty())
                .firstNotNullOfOrNull { line -> Regex("^${FocusOutbound.SESSION_COOKIE}=([^;]+)").find(line)?.groupValues?.get(1)?.takeIf { it.isNotEmpty() } }
            val date = c.date.takeIf { it > 0 }
            c.disconnect()
            Reply(code, runCatching { JSONObject(text) }.getOrDefault(JSONObject()), date, renewed)
        } catch (err: Exception) {
            Reply(0, JSONObject(), null, null)
        }
    }

    fun redeem(deviceId: String, pass: String): Reply {
        val body = FocusOutbound.redeemBody(pass) ?: return Reply(400, JSONObject().put("error", "bad_pass"), null, null)
        return call(Endpoint.REDEEM, deviceId, null, body)
    }

    fun status(deviceId: String, session: String): Reply = call(Endpoint.STATUS, deviceId, session, null)

    fun heartbeat(deviceId: String, session: String, lockOn: Boolean, permissionsOk: Boolean, clockChanged: Boolean): Reply =
        call(Endpoint.HEARTBEAT, deviceId, session, FocusOutbound.heartbeatBody(lockOn, permissionsOk, clockChanged))

    fun checkPin(deviceId: String, session: String, pin: String): Reply {
        val body = FocusOutbound.pinBody(pin) ?: return Reply(400, JSONObject().put("error", "wrong"), null, null)
        return call(Endpoint.PIN, deviceId, session, body)
    }
}

/** The app's version for its user agent, without the generated BuildConfig (switched off in new AGP versions). */
object BuildConfigLite {
    const val VERSION = 5
}
