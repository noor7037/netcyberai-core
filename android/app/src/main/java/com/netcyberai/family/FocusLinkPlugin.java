package com.netcyberai.family;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The Family app's side of the Focus app's connection (C538): the parent area (parent mode) connects NetCyberAI Focus on
// this same phone, with no code to type. It talks to the Focus app's LinkProvider only when both apps are signed with
// the same key (the Focus app checks this too), reads the Focus app's own phone id, and hands it the pass the parent area
// asked for. Used by src/components/family/focus-link.ts.
@CapacitorPlugin(name = "FocusLink")
public class FocusLinkPlugin extends Plugin {
    static final String FOCUS = "com.netcyberai.focus";
    static final Uri LINK = Uri.parse("content://com.netcyberai.focus.link");

    private boolean installed() {
        try {
            getContext().getPackageManager().getPackageInfo(FOCUS, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private boolean sameKey() {
        PackageManager pm = getContext().getPackageManager();
        return pm.checkSignatures(getContext().getPackageName(), FOCUS) == PackageManager.SIGNATURE_MATCH;
    }

    @PluginMethod
    public void status(PluginCall call) {
        boolean has = installed();
        JSObject r = new JSObject();
        r.put("installed", has);
        r.put("sameKey", has && sameKey());
        call.resolve(r);
    }

    @PluginMethod
    public void deviceId(PluginCall call) {
        if (!installed() || !sameKey()) {
            call.reject("focus_app");
            return;
        }
        try {
            Bundle b = getContext().getContentResolver().call(LINK, "device", null, null);
            String id = b == null ? null : b.getString("deviceId");
            if (id == null) {
                call.reject("focus_app");
                return;
            }
            JSObject r = new JSObject();
            r.put("deviceId", id);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("focus_app");
        }
    }

    @PluginMethod
    public void link(PluginCall call) {
        String pass = call.getString("pass");
        if (pass == null || !installed() || !sameKey()) {
            call.reject("focus_app");
            return;
        }
        try {
            Bundle extras = new Bundle();
            extras.putString("pass", pass);
            extras.putString("lang", call.getString("lang", "en"));
            Bundle b = getContext().getContentResolver().call(LINK, "link", null, extras);
            JSObject r = new JSObject();
            r.put("ok", b != null && b.getBoolean("ok", false));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("focus_app");
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent i = getContext().getPackageManager().getLaunchIntentForPackage(FOCUS);
        if (i == null) {
            call.reject("focus_app");
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + FOCUS)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(market);
        } catch (ActivityNotFoundException e) {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + FOCUS)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }
}
