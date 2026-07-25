package com.rpgifyhabits.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.accessibility.AccessibilityEvent;

import org.json.JSONObject;

/**
 * Event-driven doomscroll detector.
 *
 * Once the user enables this service (Settings → Accessibility), the SYSTEM
 * pushes a {@code TYPE_WINDOW_STATE_CHANGED} event whenever the foreground app
 * changes — no polling loop, no foreground service, no persistent notification,
 * low battery. This is the real-time, battery-friendly path a normal (sideloaded)
 * app can actually use; the OS usage-session observer API needs a privileged
 * permission we can't hold, and UsageStats polling costs a persistent service.
 *
 * The service is deliberately "dumb": it only DETECTS and RECORDS raw facts into
 * a session ledger ({@link DoomscrollUtil#appendEvent}). All scoring — the Spirit
 * effect, gains for leaving on the nudge, future total-usage stats — is computed
 * in JS from these events, so the mechanic can be retuned over-the-air without a
 * new APK. It also still fires the observation-only reflection notice when a
 * watched app crosses its per-app threshold in one continuous sitting.
 *
 * A "session" = one continuous foreground stretch in a single app. Switching to
 * a different app (including the launcher) ends it; the next open counts fresh.
 */
public class DoomscrollAccessibilityService extends AccessibilityService {

  private final Handler handler = new Handler(Looper.getMainLooper());

  private String curPkg = null;      // app currently foregrounded (or null)
  private long curStart = 0;         // when the current continuous session began
  private Integer curThreshold = null; // watched app's threshold (min), or null
  private long alertedAt = 0;        // when the reflection notice fired (0 = not yet)
  private int lastAlertMin = 0;      // elapsed-min at the last alert (for retrigger)
  private Runnable fireRunnable = null;

  @Override
  public void onAccessibilityEvent(AccessibilityEvent event) {
    if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
    CharSequence pkgCs = event.getPackageName();
    if (pkgCs == null) return;
    String pkg = pkgCs.toString();
    // WINDOW_STATE_CHANGED fires for MANY transient windows, not just app
    // switches — the keyboard, System UI (notification shade), and system
    // dialogs each report their own package. If we treated those as switches
    // we'd chop the real session into 0-min fragments and the threshold timer
    // would never accumulate. Only a genuine launchable app counts as a switch.
    if (!isRealAppSwitch(pkg)) return;
    if (pkg.equals(curPkg)) return;
    onForegroundChanged(pkg);
  }

  // True only for a real, launchable foreground app (not the keyboard, System
  // UI, a system dialog host, or our own app). Going to the launcher counts —
  // it's launchable — which correctly ends a watched session.
  private boolean isRealAppSwitch(String pkg) {
    if (pkg == null) return false;
    if (pkg.equals(getPackageName())) return false;
    if (pkg.equals("com.android.systemui")) return false;
    if (pkg.equals("android")) return false;
    String ime = currentImePackage();
    if (ime != null && pkg.equals(ime)) return false;
    // Launchable apps only — filters out IMEs/overlays that have no launcher
    // entry. (The manifest's <queries> launcher filter grants this visibility.)
    Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
    return launch != null;
  }

  private String currentImePackage() {
    try {
      String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
      if (TextUtils.isEmpty(id)) return null;
      int slash = id.indexOf('/');
      return slash > 0 ? id.substring(0, slash) : id;
    } catch (Exception e) {
      return null;
    }
  }

  private void onForegroundChanged(String newPkg) {
    long now = System.currentTimeMillis();
    if (curPkg != null) finalizeSession(now); // record the session we just left
    cancelFire();

    curPkg = newPkg;
    curStart = now;
    alertedAt = 0;
    lastAlertMin = 0;
    curThreshold = DoomscrollUtil.isEnabled(this) ? DoomscrollUtil.thresholdMinFor(this, newPkg) : null;
    if (curThreshold != null) armAlert();
  }

  private static final long MIN_RECORD_MS = 1500; // ignore sub-second UI churn

  // Append a completed session to the ledger. Rich enough that JS can score
  // doomscroll (did they leave soon after the nudge?) and — later — total usage.
  private void finalizeSession(long now) {
    // Skip trivially short sessions (transient windows that slipped the filter),
    // unless an alert fired during it (then it's real and worth recording).
    if (now - curStart < MIN_RECORD_MS && alertedAt == 0) return;
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "session");
      ev.put("package", curPkg);
      ev.put("start", curStart);
      ev.put("end", now);
      ev.put("durationSec", Math.max(0, (now - curStart) / 1000));
      ev.put("watched", curThreshold != null);
      ev.put("alerted", alertedAt > 0);
      ev.put("alertedAt", alertedAt);
      // Seconds between the nudge and actually leaving (JS decides the "left
      // promptly → reward" window). -1 when no alert fired this session.
      ev.put("leftAfterAlertSec", alertedAt > 0 ? Math.max(0, (now - alertedAt) / 1000) : -1);
      ev.put("ts", now);
      DoomscrollUtil.appendEvent(this, ev);
    } catch (Exception ignored) { }
  }

  private void armAlert() {
    long fireAt = curStart + curThreshold * 60000L;
    long delay = Math.max(0, fireAt - System.currentTimeMillis());
    fireRunnable = this::onThresholdCrossed;
    handler.postDelayed(fireRunnable, delay);
  }

  private void cancelFire() {
    if (fireRunnable != null) handler.removeCallbacks(fireRunnable);
    fireRunnable = null;
  }

  // The threshold timer fired. Because a switch away resets curPkg (via a new
  // window event), if curPkg is still the watched app the session is genuinely
  // still continuous — post the observation-only notice and record the crossing.
  private void onThresholdCrossed() {
    fireRunnable = null;
    if (curPkg == null || curThreshold == null) return;
    long now = System.currentTimeMillis();
    int elapsedMin = (int) ((now - curStart) / 60000L);
    if (elapsedMin < curThreshold) return;
    String label = DoomscrollUtil.labelFor(this, curPkg);
    DoomscrollUtil.postAlert(this, label, elapsedMin);
    if (alertedAt == 0) alertedAt = now;
    lastAlertMin = elapsedMin;
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "threshold");
      ev.put("package", curPkg);
      ev.put("start", curStart);
      ev.put("elapsedMin", elapsedMin);
      ev.put("ts", now);
      DoomscrollUtil.appendEvent(this, ev);
    } catch (Exception ignored) { }
    scheduleRetrigger();
  }

  // Optional "every N minutes" re-notice while still in the same session.
  private void scheduleRetrigger() {
    JSONObject cfg = DoomscrollUtil.readConfig(this);
    if (cfg == null) return;
    JSONObject rt = cfg.optJSONObject("retrigger");
    if (rt == null || !"every".equals(rt.optString("mode", "once"))) return;
    int everyMin = Math.max(1, rt.optInt("everyMin", 15));
    cancelFire();
    fireRunnable = this::onThresholdCrossed;
    handler.postDelayed(fireRunnable, everyMin * 60000L);
  }

  @Override
  public void onInterrupt() { }

  @Override
  public void onDestroy() {
    cancelFire();
    // Close any open session so its time isn't lost when the service stops.
    if (curPkg != null) finalizeSession(System.currentTimeMillis());
    super.onDestroy();
  }
}
