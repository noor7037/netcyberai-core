package com.netcyberai.focus

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import com.netcyberai.family.focus.AppSuggest

// Where the Family app connects this app, on the phone (C538): "device" gives this app's own phone id (for the parent
// area to set the phone up and ask the pass), "link" hands over the pass. Every call is refused unless it comes from
// com.netcyberai.family signed with the same key as this app, so no other app can read the id or plant a pass.
class LinkProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    private fun fromFamily(): Boolean {
        val ctx = context ?: return false
        val caller = callingPackage ?: return false
        return caller == AppSuggest.FAMILY_PACKAGE && ctx.packageManager.checkSignatures(caller, ctx.packageName) == PackageManager.SIGNATURE_MATCH
    }

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        val ctx = context ?: return null
        if (!fromFamily()) throw SecurityException("only NetCyberAI Family, signed with the same key")
        return when (method) {
            "device" -> Bundle().apply { putString("deviceId", Store.get(ctx).deviceId) }
            "link" -> {
                val pass = extras?.getString("pass")
                val lang = extras?.getString("lang")
                if (pass.isNullOrEmpty() || pass.length > 2048) return Bundle().apply { putBoolean("ok", false) }
                Store.update(ctx) { it.copy(pass = pass, lang = if (lang == "hi" || lang == "en") lang else it.lang) }
                Bundle().apply { putBoolean("ok", true) }
            }
            else -> null
        }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
