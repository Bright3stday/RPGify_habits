package com.rpgifyhabits.app;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.text.TextUtils;

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

  // Detection is event-driven via DoomscrollAccessibilityService (enabled by the
  // user in Settings → Accessibility). Here we just persist the watched-apps
  // config for that service to read — no polling, no foreground service.
  @PluginMethod
  public void startMonitoring(PluginCall call) {
    DoomscrollUtil.writeConfig(getContext(), call.getData().toString());
    call.resolve();
  }

  @PluginMethod
  public void stopMonitoring(PluginCall call) {
    DoomscrollUtil.writeConfig(getContext(), "{\"enabled\":false,\"apps\":[]}");
    call.resolve();
  }

  // Is our accessibility detector currently enabled in system settings?
  @PluginMethod
  public void isAccessibilityEnabled(PluginCall call) {
    JSObject r = new JSObject();
    r.put("enabled", accessibilityEnabled());
    call.resolve(r);
  }

  private boolean accessibilityEnabled() {
    String flat = Settings.Secure.getString(
        getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
    if (TextUtils.isEmpty(flat)) return false;
    String me = getContext().getPackageName() + "/" + DoomscrollAccessibilityService.class.getName();
    String meShort = getContext().getPackageName() + "/.DoomscrollAccessibilityService";
    TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
    splitter.setString(flat);
    while (splitter.hasNext()) {
      String s = splitter.next();
      if (s.equalsIgnoreCase(me) || s.equalsIgnoreCase(meShort)) return true;
    }
    return false;
  }

  @PluginMethod
  public void openAccessibilitySettings(PluginCall call) {
    Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }

  // Read the raw session ledger the detector has recorded. JS computes all
  // scoring from these events (and tracks the last `seq` it has processed).
  @PluginMethod
  public void readEvents(PluginCall call) {
    JSObject r = new JSObject();
    try { r.put("events", new JSONArray(DoomscrollUtil.readEventsJson(getContext()))); }
    catch (Exception e) { r.put("events", new JSONArray()); }
    r.put("seq", DoomscrollUtil.currentSeq(getContext()));
    call.resolve(r);
  }

  // On-device diagnostic: what app is foregrounded right now, and for how long?
  @PluginMethod
  public void probe(PluginCall call) {
    JSObject r = new JSObject();
    if (!usageAccessGranted()) { r.put("granted", false); call.resolve(r); return; }
    r.put("granted", true);
    DoomscrollUtil.Session s = DoomscrollUtil.currentForeground(getContext());
    if (s == null) { r.put("foreground", false); call.resolve(r); return; }
    r.put("foreground", true);
    r.put("package", s.pkg);
    r.put("label", DoomscrollUtil.labelFor(getContext(), s.pkg));
    r.put("elapsedMin", (int) ((System.currentTimeMillis() - s.start) / 60000L));
    r.put("watched", DoomscrollUtil.isWatched(getContext(), s.pkg));
    call.resolve(r);
  }

  // Post a sample reflection alert now, to confirm the notification path works.
  @PluginMethod
  public void fireTestAlert(PluginCall call) {
    DoomscrollUtil.Session s = DoomscrollUtil.currentForeground(getContext());
    String label = (s != null) ? DoomscrollUtil.labelFor(getContext(), s.pkg) : "this session";
    int mins = (s != null) ? Math.max(1, (int) ((System.currentTimeMillis() - s.start) / 60000L)) : 1;
    DoomscrollUtil.postAlert(getContext(), label, mins);
    JSObject r = new JSObject();
    r.put("ok", true);
    call.resolve(r);
  }

  @PluginMethod
  public void isMonitoring(PluginCall call) {
    JSObject r = new JSObject();
    // Active = detector enabled in system settings AND the user has it turned on.
    r.put("active", accessibilityEnabled() && DoomscrollUtil.isEnabled(getContext()));
    call.resolve(r);
  }
}
