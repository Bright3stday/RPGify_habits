package com.rpgifyhabits.app;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;

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

  // Sentinel path: persist the config and start the foreground service, which
  // records sessions to the ledger AND fires the live nudge at the threshold.
  @PluginMethod
  public void startMonitoring(PluginCall call) {
    String cfg = call.getData().toString();
    DoomscrollUtil.writeConfig(getContext(), cfg);
    Intent i = new Intent(getContext(), DoomscrollService.class);
    i.setAction(DoomscrollService.ACTION_START);
    i.putExtra(DoomscrollService.EXTRA_CONFIG, cfg);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getContext().startForegroundService(i);
    } else {
      getContext().startService(i);
    }
    call.resolve();
  }

  // Stop the Sentinel service (e.g. switching to Oracle, or turning the feature
  // off). Leaves the persisted config alone so Oracle can keep using it.
  @PluginMethod
  public void stopMonitoring(PluginCall call) {
    try { getContext().stopService(new Intent(getContext(), DoomscrollService.class)); }
    catch (Exception ignored) { /* not running */ }
    call.resolve();
  }

  // Oracle path: persist the current config and reconstruct completed sessions
  // since the last check into the ledger. Called on open/resume — no background
  // service, no notification. Returns how many sessions were added.
  @PluginMethod
  public void syncUsage(PluginCall call) {
    DoomscrollUtil.writeConfig(getContext(), call.getData().toString());
    int added = usageAccessGranted() ? DoomscrollUtil.syncSessions(getContext()) : 0;
    JSObject r = new JSObject();
    r.put("added", added);
    call.resolve(r);
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
    // Active = the Sentinel foreground service is currently running.
    r.put("active", DoomscrollService.isRunningFlag());
    call.resolve(r);
  }
}
