package com.netcyberai.family.focus

// Everything the NetCyberAI Focus app sends (C304, C538): one host, four requests, fixed bodies. The app's only HTTP
// client builds every request from here, and FocusOutboundTest fails on any other host, path or field. Nothing about
// which app was opened, or when, can be put into any of them.
object FocusOutbound {
    const val HOST = "www.netcyberai.com"
    const val DEVICE_HEADER = "x-focus-device"
    const val SESSION_COOKIE = "ncf_session"

    enum class Endpoint(val method: String, val path: String) {
        /** The pass from the parent area, traded for the Focus app's own family session (C538). */
        REDEEM("POST", "/api/family/focus/redeem"),

        /** Today's plan done or not, what is pending, the PIN's version (M2b-1). */
        STATUS("GET", "/api/family/focus/status"),

        /** The lock's health: three flags and nothing else (M2b-1). */
        HEARTBEAT("POST", "/api/family/focus/heartbeat"),

        /** The parent's PIN, checked once against the server at set-up or after a reset (C304). */
        PIN("POST", "/api/family/pin/unlock"),
    }

    fun url(e: Endpoint): String = "https://$HOST${e.path}"

    private val DEVICE = Regex("^[A-Za-z0-9_-]{32,128}$")
    private val PASS = Regex("^[A-Za-z0-9_.-]{20,2048}$")

    fun isDeviceId(id: String): Boolean = DEVICE.matches(id)

    fun heartbeatBody(lockOn: Boolean, permissionsOk: Boolean, clockChanged: Boolean): String =
        "{\"lockOn\":$lockOn,\"permissionsOk\":$permissionsOk,\"clockChanged\":$clockChanged}"

    /** null for anything that is not a signed pass (its three base64url parts), so nothing else can be carried. */
    fun redeemBody(pass: String): String? = if (PASS.matches(pass)) "{\"pass\":\"$pass\"}" else null

    fun pinBody(pin: String): String? = if (PinHasher.isWellFormed(pin)) "{\"pin\":\"$pin\"}" else null
}
