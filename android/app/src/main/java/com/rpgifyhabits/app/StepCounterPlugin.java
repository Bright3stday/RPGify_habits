package com.rpgifyhabits.app;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Minimal bridge to the hardware step-counter sensor (TYPE_STEP_COUNTER).
 *
 * The sensor reports cumulative steps SINCE THE LAST REBOOT; converting that to
 * "steps today" (baseline per day, reboot handling) is done in JS
 * (www/js/pedometer.js). Here we just keep a low-power persistent listener and
 * hand back the latest cumulative reading.
 *
 * Everything is on-device: no Google Fit, no Health Connect, no network.
 */
@CapacitorPlugin(
    name = "StepCounter",
    permissions = {
        @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION })
    }
)
public class StepCounterPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor stepSensor;
    private boolean listening = false;
    private long latest = -1; // cumulative since boot; -1 = no reading yet

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        }
    }

    private boolean permissionGranted() {
        // ACTIVITY_RECOGNITION is only enforced on Android 10 (Q) and above.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return getPermissionState("activity") == PermissionState.GRANTED;
    }

    private void startListening() {
        if (listening || stepSensor == null || !permissionGranted()) return;
        sensorManager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_UI);
        listening = true;
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (permissionGranted()) {
            startListening();
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("activity", call, "permCallback");
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        boolean granted = permissionGranted();
        if (granted) startListening();
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void getSteps(final PluginCall call) {
        if (stepSensor == null) {
            resolveSteps(call, false, "no-sensor", 0);
            return;
        }
        if (!permissionGranted()) {
            resolveSteps(call, false, "permission", 0);
            return;
        }
        startListening();
        if (latest >= 0) {
            resolveSteps(call, true, null, latest);
            return;
        }
        // No reading cached yet — give the sensor a moment to deliver one.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (latest >= 0) resolveSteps(call, true, null, latest);
            else resolveSteps(call, false, "no-reading", 0);
        }, 1200);
    }

    private void resolveSteps(PluginCall call, boolean available, String reason, long steps) {
        JSObject r = new JSObject();
        r.put("available", available);
        if (reason != null) r.put("reason", reason);
        r.put("steps", steps);
        call.resolve(r);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event != null && event.values != null && event.values.length > 0) {
            latest = (long) event.values[0];
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    protected void handleOnDestroy() {
        if (sensorManager != null && listening) {
            sensorManager.unregisterListener(this);
            listening = false;
        }
        super.handleOnDestroy();
    }
}
