package com.rpgifyhabits.app;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.List;

/**
 * Bridge for the doomscroll reflection alert. Reads Usage Access state, opens
 * the special-access settings screen, lists launchable apps for the picker, and
 * starts/stops the foreground monitoring service. The detection loop itself
 * lives in {@link DoomscrollService}; the tone-neutral copy logic is mirrored in
 * www/js/doomscroll.js (and unit-tested there).
 */
@CapacitorPlugin(name = "Doomscroll")
public class DoomscrollPlugin extends Plugin {

  private boolean usageAccessGranted() {
    Context ctx = getContext();
    AppOpsManager appOps = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
    int mode;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
    } else {
      mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
    }
    return mode == AppOpsManager.MODE_ALLOWED;
  }

  @PluginMethod
  public void hasUsageAccess(PluginCall call) {
    JSObject r = new JSObject();
    r.put("granted", usageAccessGranted());
    call.resolve(r);
  }

  @PluginMethod
  public void openUsageAccessSettings(PluginCall call) {
    Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }

  // Launchable, user-facing apps only (uses a <queries> launcher filter in the
  // manifest instead of the sensitive QUERY_ALL_PACKAGES permission).
  @PluginMethod
  public void getInstalledApps(PluginCall call) {
    PackageManager pm = getContext().getPackageManager();
    List<ApplicationInfo> apps = pm.getInstalledApplications(0);
    JSONArray arr = new JSONArray();
    for (ApplicationInfo ai : apps) {
      if (pm.getLaunchIntentForPackage(ai.packageName) == null) continue;
      if (ai.packageName.equals(getContext().getPackageName())) continue;
      JSObject o = new JSObject();
      o.put("package", ai.packageName);
      o.put("label", pm.getApplicationLabel(ai).toString());
      arr.put(o);
    }
    JSObject r = new JSObject();
    r.put("apps", arr);
    call.resolve(r);
  }

  @PluginMethod
  public void startMonitoring(PluginCall call) {
    Intent i = new Intent(getContext(), DoomscrollService.class);
    i.setAction(DoomscrollService.ACTION_START);
    i.putExtra(DoomscrollService.EXTRA_CONFIG, call.getData().toString());
    ContextCompat.startForegroundService(getContext(), i);
    DoomscrollService.setRunningFlag(true);
    call.resolve();
  }

  @PluginMethod
  public void stopMonitoring(PluginCall call) {
    Intent i = new Intent(getContext(), DoomscrollService.class);
    i.setAction(DoomscrollService.ACTION_STOP);
    getContext().startService(i);
    DoomscrollService.setRunningFlag(false);
    call.resolve();
  }

  @PluginMethod
  public void isMonitoring(PluginCall call) {
    JSObject r = new JSObject();
    r.put("active", DoomscrollService.isRunningFlag());
    call.resolve(r);
  }
}
