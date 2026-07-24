package com.rpgifyhabits.app;

import android.app.PendingIntent;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.RequiresApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * OS-driven detection (API 29+): one {@code registerUsageSessionObserver} per
 * watched app. The system itself fires our {@link DoomscrollReceiver} the moment
 * an app's continuous session reaches its per-app time limit — no polling, no
 * foreground service, low battery. A "session" ends after {@code SESSION_GAP_MIN}
 * of the app not being used, then a new session starts counting from zero.
 *
 * Observer ids are the app's index in the config. Registrations survive process
 * death but not reboot (re-registered by DoomscrollBootReceiver) and are cleared
 * on force-stop.
 */
public final class DoomscrollObserver {
  private DoomscrollObserver() { }

  private static final int MAX_OBSERVERS = 64; // defensively unregister this range

  public static boolean supported() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
  }

  @RequiresApi(api = Build.VERSION_CODES.Q)
  public static void register(Context ctx) {
    UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
    if (usm == null) return;
    unregister(ctx); // clear any previous observers first
    JSONObject cfg = DoomscrollUtil.readConfig(ctx);
    if (cfg == null || !cfg.optBoolean("enabled", false)) return;
    JSONArray apps = cfg.optJSONArray("apps");
    if (apps == null) return;
    for (int i = 0; i < apps.length() && i < MAX_OBSERVERS; i++) {
      try {
        JSONObject a = apps.getJSONObject(i);
        String pkg = a.getString("package");
        int threshold = Math.max(1, a.optInt("thresholdMin", 20));
        usm.registerUsageSessionObserver(
            i, new String[]{ pkg },
            threshold, TimeUnit.MINUTES,
            DoomscrollUtil.SESSION_GAP_MIN, TimeUnit.MINUTES,
            broadcast(ctx, DoomscrollReceiver.ACTION_LIMIT, i),
            broadcast(ctx, DoomscrollReceiver.ACTION_SESSION_END, i));
      } catch (Exception ignored) { }
    }
  }

  public static void unregister(Context ctx) {
    if (!supported()) return;
    UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
    if (usm == null) return;
    for (int i = 0; i < MAX_OBSERVERS; i++) {
      try { usm.unregisterUsageSessionObserver(i); } catch (Exception ignored) { }
    }
  }

  private static PendingIntent broadcast(Context ctx, String action, int observerId) {
    Intent i = new Intent(ctx, DoomscrollReceiver.class)
        .setAction(action)
        .putExtra("observerId", observerId);
    int req = observerId * 10 + (DoomscrollReceiver.ACTION_LIMIT.equals(action) ? 1 : 2);
    return PendingIntent.getBroadcast(ctx, req, i,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }
}
