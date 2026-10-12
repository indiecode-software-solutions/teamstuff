package com.corporate.intranet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeVibrationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
