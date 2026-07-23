package com.rpgifyhabits.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the on-device step-counter bridge before the web layer loads.
        registerPlugin(StepCounterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
