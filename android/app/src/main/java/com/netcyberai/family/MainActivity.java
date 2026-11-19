package com.netcyberai.family;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

// The Family app's shell (founder, 19 Nov 2026).
//
// Back: Capacitor's core does not handle the phone's Back (only its App plugin does, which this app does not use), so Back
// closed the app from any page. Now Back first asks the page to close its topmost panel (window.famBack, an attach menu or a
// photo sheet: src/components/family/useBackClose.ts), else goes back one page in the web view's history (a chapter to its
// subject, Study to Home), and only on the first page leaves the app, as every Android app does.
//
// Keyboard: on Android 15 the app draws edge to edge, so the web view is not resized when the keyboard opens and the page
// could only guess the keyboard's height, and never knew when it closed (the Ask pill stayed up). Now the shell measures the
// keyboard (the IME inset, less the navigation bar the page already sits above) on every layout change and tells the page:
// window event `fam-ime` with { height } in CSS pixels, 0 when closed (src/components/family/tutor/keyboard-lift.ts).
public class MainActivity extends BridgeActivity {
    private int lastIme = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final View root = getWindow().getDecorView();
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> reportKeyboard(root));

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView web = bridge == null ? null : bridge.getWebView();
                if (web == null) {
                    leave(this);
                    return;
                }
                web.evaluateJavascript("(window.famBack && window.famBack()) ? '1' : '0'", (closed) -> {
                    if ("\"1\"".equals(closed)) return;
                    if (web.canGoBack()) web.goBack();
                    else leave(this);
                });
            }
        });
    }

    // The first page: Back leaves the app the usual way (the system's own Back, with this callback stepped aside once).
    private void leave(OnBackPressedCallback self) {
        self.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        self.setEnabled(true);
    }

    private void reportKeyboard(View root) {
        if (bridge == null) return;
        final WebView web = bridge.getWebView();
        final WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
        if (web == null || insets == null) return;
        final Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
        final Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
        final int px = insets.isVisible(WindowInsetsCompat.Type.ime()) ? Math.max(0, ime.bottom - bars.bottom) : 0;
        if (px == lastIme) return;
        lastIme = px;
        final int css = Math.round(px / getResources().getDisplayMetrics().density);
        web.post(() -> web.evaluateJavascript("window.dispatchEvent(new CustomEvent('fam-ime',{detail:{height:" + css + "}}))", null));
    }
}
