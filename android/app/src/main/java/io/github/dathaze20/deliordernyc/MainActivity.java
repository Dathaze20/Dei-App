package io.github.dathaze20.deliordernyc;

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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeliNativePlugin.class);
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
