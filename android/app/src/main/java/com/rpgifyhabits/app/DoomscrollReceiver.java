package com.rpgifyhabits.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;

/**
 * Receives the OS session-observer callbacks and drives the alert.
 *
 *  ACTION_LIMIT       — the app's continuous session reached its threshold. Post
 *                       the observation-only alert; if retrigger = every N, arm a
 *                       re-verified alarm N minutes out.
 *  ACTION_RETRIGGER   — our own alarm: if the SAME session is still foreground and
 *                       still past threshold, post again and re-arm; else stop.
 *  ACTION_SESSION_END — the session ended; cancel any pending retrigger.
 */
public class DoomscrollReceiver extends BroadcastReceiver {
  public static final String ACTION_LIMIT = "com.rpgifyhabits.app.DS_LIMIT";
  public static final String ACTION_RETRIGGER = "com.rpgifyhabits.app.DS_RETRIGGER";
  public static final String ACTION_SESSION_END = "com.rpgifyhabits.app.DS_SESSION_END";

  @Override
  public void onReceive(Context ctx, Intent intent) {
    String action = intent.getAction();
    if (action == null) return;
    int obs = intent.getIntExtra(UsageStatsManager.EXTRA_OBSERVER_ID, intent.getIntExtra("observerId", -1));
    JSONObject app = appAt(ctx, obs);
    if (app == null) return;
    String pkg = app.optString("package");
    int threshold = Math.max(1, app.optInt("thresholdMin", 20));

    if (ACTION_SESSION_END.equals(action)) {
      cancelRetrigger(ctx, obs, pkg);
      return;
    }

    // LIMIT or RETRIGGER: confirm the app is genuinely in a continuous session now.
    DoomscrollUtil.Session s = DoomscrollUtil.currentSession(ctx, Collections.singleton(pkg));

    if (ACTION_RETRIGGER.equals(action)) {
      long armedStart = intent.getLongExtra("sessionStart", -1);
      if (s == null || s.start != armedStart) return; // session changed/ended -> stop
    }
    if (s == null) return; // app not foreground anymore; skip (system may lag)

    int elapsedMin = (int) ((System.currentTimeMillis() - s.start) / 60000L);
    if (elapsedMin < threshold) elapsedMin = threshold; // observer says we crossed it
    DoomscrollUtil.postAlert(ctx, DoomscrollUtil.labelFor(ctx, pkg), elapsedMin);

    JSONObject rt = retrigger(ctx);
    if (rt != null && "every".equals(rt.optString("mode"))) {
      int everyMin = Math.max(1, rt.optInt("everyMin", 15));
      armRetrigger(ctx, obs, pkg, s.start, everyMin);
    }
  }

  private void armRetrigger(Context ctx, int obs, String pkg, long sessionStart, int everyMin) {
    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    long at = System.currentTimeMillis() + everyMin * 60000L;
    // Inexact (doze-tolerant) — a periodic nudge doesn't need exact-alarm access.
    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, retriggerPi(ctx, obs, sessionStart));
  }

  private void cancelRetrigger(Context ctx, int obs, String pkg) {
    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    am.cancel(retriggerPi(ctx, obs, -1));
  }

  private PendingIntent retriggerPi(Context ctx, int obs, long sessionStart) {
    Intent i = new Intent(ctx, DoomscrollReceiver.class)
        .setAction(ACTION_RETRIGGER)
        .putExtra("observerId", obs)
        .putExtra("sessionStart", sessionStart);
    return PendingIntent.getBroadcast(ctx, obs * 10 + 3, i,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  private static JSONObject appAt(Context ctx, int obs) {
    JSONArray apps = DoomscrollUtil.apps(ctx);
    if (apps == null || obs < 0 || obs >= apps.length()) return null;
    return apps.optJSONObject(obs);
  }

  private static JSONObject retrigger(Context ctx) {
    JSONObject c = DoomscrollUtil.readConfig(ctx);
    return c != null ? c.optJSONObject("retrigger") : null;
  }
}
