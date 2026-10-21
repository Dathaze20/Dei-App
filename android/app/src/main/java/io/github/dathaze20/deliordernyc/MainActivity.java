package io.github.dathaze20.deliordernyc;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Asks the web app first (utils/backStack.ts): it closes an open sheet or the menu, or returns
     * to the home screen, and answers true. Only when it answers false (already on the home screen
     * with nothing open, or the page cannot answer) does Back do Android's usual thing.
     */
    private static final String ASK_WEB_APP =
        "(function(){try{return !!(window.deliBack && window.deliBack());}catch(e){return false;}})()";

    /**
     * A product id from a shelf-tag link (deliordernyc://product/<id>), waiting for the web app to
     * ask for it (DeliNativePlugin.consumeProductLink). Only letters, digits, "_" and "-".
     */
    private static volatile String pendingProductId;

    static String takePendingProductId() {
        String id = pendingProductId;
        pendingProductId = null;
        return id;
    }

    private static void rememberProductLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"deliordernyc".equals(data.getScheme()) || !"product".equals(data.getHost())) return;
        String id = data.getLastPathSegment();
        if (id != null && id.matches("[A-Za-z0-9_-]{1,100}")) pendingProductId = id;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        rememberProductLink(intent);
        // The app was already open: tell the page to pick the link up now.
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null) webView.evaluateJavascript("window.deliProductLink && window.deliProductLink()", null);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeliNativePlugin.class);
        rememberProductLink(getIntent());
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView == null) {
                    leave();
                    return;
                }
                webView.evaluateJavascript(ASK_WEB_APP, result -> {
                    if (!"true".equals(result)) leave();
                });
            }

            private void leave() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
