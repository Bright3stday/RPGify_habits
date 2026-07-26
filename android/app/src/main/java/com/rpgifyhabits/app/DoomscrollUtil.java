package com.rpgifyhabits.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Shared helpers for the doomscroll monitor: config persistence, session
 * reconstruction from UsageStats, and the observation-only alert notification.
 * Used by both detection paths — the Oracle on-open sync (via DoomscrollPlugin)
 * and the Sentinel foreground service (DoomscrollService). All detection is
 * Usage-Access based; there is no Accessibility service.
 */
public final class DoomscrollUtil {
  private DoomscrollUtil() { }

  public static final String PREFS = "doomscroll";
  public static final String KEY_CONFIG = "config";
  public static final String CH_ONGOING = "doomscroll_service";
  public static final String CH_ALERT = "doomscroll_alert";
  public static final int SESSION_GAP_MIN = 1; // gap (min) that ends a continuous session

  // ---- config persistence (so receivers/boot can read it) ----------------

  public static void writeConfig(Context ctx, String json) {
    SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    p.edit().putString(KEY_CONFIG, json).apply();
  }

  public static JSONObject readConfig(Context ctx) {
    String s = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CONFIG, null);
    if (s == null) return null;
    try { return new JSONObject(s); } catch (Exception e) { return null; }
  }

  public static boolean isEnabled(Context ctx) {
    JSONObject c = readConfig(ctx);
    return c != null && c.optBoolean("enabled", false);
  }

  public static JSONArray apps(Context ctx) {
    JSONObject c = readConfig(ctx);
    return c != null ? c.optJSONArray("apps") : null;
  }

  // ---- current continuous session (mirrors doomscroll.js currentSession) --

  public static final class Session {
    public final String pkg;
    public final long start;
    Session(String pkg, long start) { this.pkg = pkg; this.start = start; }
  }

  // The current continuous foreground session for ANY app (or null).
  public static Session currentForeground(Context ctx) {
    UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
    if (usm == null) return null;
    long now = System.currentTimeMillis();
    UsageEvents events = usm.queryEvents(now - 12L * 60 * 60 * 1000, now);
    UsageEvents.Event e = new UsageEvents.Event();
    String fg = null;
    long start = 0;
    while (events.hasNextEvent()) {
      events.getNextEvent(e);
      if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) {
        fg = e.getPackageName();
        start = e.getTimeStamp();
      } else if (e.getEventType() == UsageEvents.Event.MOVE_TO_BACKGROUND && e.getPackageName().equals(fg)) {
        fg = null;
      }
    }
    return fg != null ? new Session(fg, start) : null;
  }

  public static Session currentSession(Context ctx, Set<String> watched) {
    Session s = currentForeground(ctx);
    return (s != null && watched.contains(s.pkg)) ? s : null;
  }

  public static boolean isWatched(Context ctx, String pkg) {
    return thresholdMinFor(ctx, pkg) != null;
  }

  // The per-app continuous-session threshold (minutes), or null if not watched.
  public static Integer thresholdMinFor(Context ctx, String pkg) {
    JSONArray apps = apps(ctx);
    if (apps == null || pkg == null) return null;
    for (int i = 0; i < apps.length(); i++) {
      JSONObject a = apps.optJSONObject(i);
      if (a != null && pkg.equals(a.optString("package"))) return a.optInt("thresholdMin", 20);
    }
    return null;
  }

  // ---- raw event ledger ---------------------------------------------------
  //
  // The native detector only RECORDS raw facts here; all scoring (Spirit
  // effects, future total-usage stats) is computed in JS from these events, so
  // the mechanic can be retuned over-the-air without a new APK. Events carry a
  // monotonic `seq`; JS tracks the last seq it processed and never reprocesses.
  // Self-capped to the most recent MAX_EVENTS so the store can't grow unbounded.

  public static final String KEY_EVENTS = "events";
  public static final String KEY_SEQ = "seq";
  private static final int MAX_EVENTS = 500;

  public static synchronized void appendEvent(Context ctx, JSONObject event) {
    SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    long seq = p.getLong(KEY_SEQ, 0) + 1;
    JSONArray arr;
    try { arr = new JSONArray(p.getString(KEY_EVENTS, "[]")); } catch (Exception e) { arr = new JSONArray(); }
    try {
      event.put("seq", seq);
      arr.put(event);
    } catch (Exception ignored) { }
    // Trim to the newest MAX_EVENTS.
    if (arr.length() > MAX_EVENTS) {
      JSONArray trimmed = new JSONArray();
      for (int i = arr.length() - MAX_EVENTS; i < arr.length(); i++) trimmed.put(arr.optJSONObject(i));
      arr = trimmed;
    }
    p.edit().putString(KEY_EVENTS, arr.toString()).putLong(KEY_SEQ, seq).apply();
  }

  public static String readEventsJson(Context ctx) {
    return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_EVENTS, "[]");
  }

  public static long currentSeq(Context ctx) {
    return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_SEQ, 0);
  }

  // ---- session reconstruction (shared by BOTH doomscroll paths) -----------
  //
  // Reconstruct COMPLETED continuous sessions in watched apps from UsageStats
  // since the last sync, and append one ledger row per session. Used by:
  //   • the Oracle path — called on open (plugin.syncUsage), so the reckoning
  //     shows on return without anything running in the background; and
  //   • the Sentinel service — called each poll, so the ledger stays fresh live.
  // A single cursor (KEY_LAST_SYNC) is shared, so the two never double-count and
  // switching paths loses nothing. Rows carry `durationSec` + `thresholdMin`;
  // scoring (restraint vs binge) is computed in JS (spirit.js), OTA-tunable.

  public static final String KEY_LAST_SYNC = "lastSyncTs";
  private static final long MAX_BACKFILL_MS = 24L * 60 * 60 * 1000; // cap first-run backlog
  private static final long MIN_SESSION_MS = 1500; // ignore sub-second UI churn

  public static synchronized int syncSessions(Context ctx) {
    UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
    if (usm == null) return 0;
    JSONObject config = readConfig(ctx);
    if (config == null || !config.optBoolean("enabled", false)) return 0;
    Map<String, Integer> thresholds = thresholdMap(ctx);
    if (thresholds.isEmpty()) return 0;

    long now = System.currentTimeMillis();
    SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    long last = p.getLong(KEY_LAST_SYNC, 0);
    long queryStart = (last <= 0) ? now - MAX_BACKFILL_MS : Math.max(last, now - MAX_BACKFILL_MS);

    UsageEvents events = usm.queryEvents(queryStart, now);
    UsageEvents.Event e = new UsageEvents.Event();
    String fg = null;
    long fgStart = 0;
    int added = 0;

    while (events.hasNextEvent()) {
      events.getNextEvent(e);
      int type = e.getEventType();
      long ts = e.getTimeStamp();
      if (type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
        // A new app comes forward: close the previous one as a completed session.
        if (fg != null) added += maybeRecord(ctx, fg, fgStart, ts, thresholds);
        fg = e.getPackageName();
        fgStart = ts;
      } else if (type == UsageEvents.Event.MOVE_TO_BACKGROUND) {
        if (fg != null && e.getPackageName().equals(fg)) {
          added += maybeRecord(ctx, fg, fgStart, ts, thresholds);
          fg = null;
          fgStart = 0;
        }
      }
    }

    // Anything still foregrounded at the end is an ONGOING session: don't record
    // it yet, and rewind the cursor to its start so its full duration is captured
    // when it ends (next sync). Otherwise advance the cursor to now. Never rewind
    // past the previous cursor, so completed sessions are never reprocessed.
    long newCursor = (fg != null) ? Math.max(last, fgStart) : now;
    p.edit().putLong(KEY_LAST_SYNC, newCursor).apply();
    return added;
  }

  private static int maybeRecord(Context ctx, String pkg, long start, long end, Map<String, Integer> thresholds) {
    if (end - start < MIN_SESSION_MS) return 0;
    Integer tMin = thresholds.get(pkg);
    if (tMin == null) return 0; // only record the apps the user chose to watch
    try {
      JSONObject ev = new JSONObject();
      ev.put("type", "session");
      ev.put("package", pkg);
      ev.put("start", start);
      ev.put("end", end);
      ev.put("durationSec", Math.max(0, (end - start) / 1000));
      ev.put("watched", true);
      ev.put("thresholdMin", (int) tMin);
      ev.put("ts", end);
      appendEvent(ctx, ev);
      return 1;
    } catch (Exception ignored) {
      return 0;
    }
  }

  // watched package -> per-app threshold (minutes), from the persisted config.
  private static Map<String, Integer> thresholdMap(Context ctx) {
    Map<String, Integer> m = new HashMap<>();
    JSONArray apps = apps(ctx);
    if (apps != null) {
      for (int i = 0; i < apps.length(); i++) {
        JSONObject a = apps.optJSONObject(i);
        if (a == null) continue;
        String pkg = a.optString("package", "");
        if (!pkg.isEmpty()) m.put(pkg, a.optInt("thresholdMin", 20));
      }
    }
    return m;
  }

  public static String labelFor(Context ctx, String pkg) {
    try {
      return ctx.getPackageManager().getApplicationLabel(
          ctx.getPackageManager().getApplicationInfo(pkg, 0)).toString();
    } catch (Exception e) {
      return pkg;
    }
  }

  // ---- notifications ------------------------------------------------------

  public static void ensureChannels(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    NotificationChannel ongoing = new NotificationChannel(CH_ONGOING, "Focus monitor", NotificationManager.IMPORTANCE_MIN);
    ongoing.setDescription("Persistent notice while the focus monitor is running (older Android only).");
    NotificationChannel alert = new NotificationChannel(CH_ALERT, "Reflection alerts", NotificationManager.IMPORTANCE_HIGH);
    alert.setDescription("A factual note when a session passes your threshold.");
    nm.createNotificationChannel(ongoing);
    nm.createNotificationChannel(alert);
  }

  // Observation-only copy — factual mirror, no instruction/warning.
  // Mirrors doomscroll.js observationCopy().
  public static String observationCopy(String label, int elapsedMin) {
    int m = Math.max(1, elapsedMin);
    return m + (m == 1 ? " minute on " : " minutes on ") + label;
  }

  public static void postAlert(Context ctx, String label, int elapsedMin) {
    ensureChannels(ctx);
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_ALERT)
        .setSmallIcon(ctx.getApplicationInfo().icon)
        .setContentTitle(observationCopy(label, elapsedMin))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_STATUS) // a status mirror, not an alarm/warning
        .setAutoCancel(true);
    int reflect = ctx.getResources().getIdentifier("ic_reflect", "drawable", ctx.getPackageName());
    if (reflect != 0) b.setLargeIcon(BitmapFactory.decodeResource(ctx.getResources(), reflect));
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
  }
}
