package com.rpgifyhabits.app;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
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
    // Ignore our own UI and repeats of the same foreground app (window churn
    // within one app fires many events).
    if (pkg.equals(getPackageName())) return;
    if (pkg.equals(curPkg)) return;
    onForegroundChanged(pkg);
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

  // Append a completed session to the ledger. Rich enough that JS can score
  // doomscroll (did they leave soon after the nudge?) and — later — total usage.
  private void finalizeSession(long now) {
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
