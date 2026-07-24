package com.rpgifyhabits.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native bridges before the web layer loads.
        registerPlugin(StepCounterPlugin.class);
        registerPlugin(DoomscrollPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
