package io.github.dathaze20.deliordernyc;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeliNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
