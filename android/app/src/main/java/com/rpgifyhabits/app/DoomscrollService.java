package com.rpgifyhabits.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Foreground service that polls Android UsageStats (~every pollMinutes) to
 * detect a *continuous* session in a user-chosen app, and fires a reflection
 * alert once its per-app threshold is crossed. Chosen over WorkManager (15-min
 * floor) for tighter detection, at the cost of a persistent notification and
 * more battery — an accepted tradeoff.
 *
 * Session = per continuous use: switching away ends it and the next open counts
 * from zero. Duration uses real event timestamps (second-accurate); the poll
 * interval only bounds how soon a crossing is noticed (worst case ~pollMinutes).
 *
 * The alert copy is observation-only ("28 minutes on Instagram") — no
 * instruction, no warning styling. This mirrors www/js/doomscroll.js.
 */
public class DoomscrollService extends Service {
  public static final String ACTION_START = "rpgify.doomscroll.START";
  public static final String ACTION_STOP = "rpgify.doomscroll.STOP";
  public static final String EXTRA_CONFIG = "config";

  private static final String CH_ONGOING = "doomscroll_service";
  private static final String CH_ALERT = "doomscroll_alert";
  private static final int ONGOING_ID = 424242;

  private static volatile boolean running = false;
  public static void setRunningFlag(boolean v) { running = v; }
  public static boolean isRunningFlag() { return running; }

  private HandlerThread thread;
  private Handler handler;
  private long pollMs = 5 * 60 * 1000L;
  private final Map<String, Integer> thresholds = new HashMap<>(); // package -> minutes
  private String retriggerMode = "once";
  private int retriggerEvery = 15;

  // Current-session alert tracking (mirrors JS shouldAlert()).
  private String sessionKey = null; // package + "@" + sessionStart
  private Integer lastAlertMin = null;

  @Override
  public void onCreate() {
    super.onCreate();
    createChannels();
    thread = new HandlerThread("doomscroll");
    thread.start();
    handler = new Handler(thread.getLooper());
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null && ACTION_STOP.equals(intent.getAction())) {
      stopSelfCleanly();
      return START_NOT_STICKY;
    }
    if (intent != null && intent.hasExtra(EXTRA_CONFIG)) parseConfig(intent.getStringExtra(EXTRA_CONFIG));
    startForeground(ONGOING_ID, buildOngoing());
    running = true;
    handler.removeCallbacksAndMessages(null);
    handler.post(pollTask);
    return START_STICKY;
  }

  private final Runnable pollTask = new Runnable() {
    @Override
    public void run() {
      try { poll(); } catch (Exception ignored) { }
      handler.postDelayed(this, pollMs);
    }
  };

  private void parseConfig(String json) {
    thresholds.clear();
    try {
      JSONObject o = new JSONObject(json);
      pollMs = Math.max(1, Math.min(30, o.optInt("pollMinutes", 5))) * 60 * 1000L;
      JSONArray apps = o.optJSONArray("apps");
      if (apps != null) {
        for (int i = 0; i < apps.length(); i++) {
          JSONObject a = apps.getJSONObject(i);
          thresholds.put(a.getString("package"), a.optInt("thresholdMin", 20));
        }
      }
      JSONObject rt = o.optJSONObject("retrigger");
      if (rt != null) {
        retriggerMode = rt.optString("mode", "once");
        retriggerEvery = rt.optInt("everyMin", 15);
      }
    } catch (Exception ignored) { }
  }

  // Mirrors doomscroll.js currentSession() + shouldAlert().
  private void poll() {
    UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
    if (usm == null || thresholds.isEmpty()) return;
    long now = System.currentTimeMillis();
    long begin = now - 12L * 60 * 60 * 1000; // look back far enough to find the session start
    UsageEvents events = usm.queryEvents(begin, now);
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
    if (fg == null || !thresholds.containsKey(fg)) { sessionKey = null; lastAlertMin = null; return; }

    String key = fg + "@" + start;
    if (!key.equals(sessionKey)) { sessionKey = key; lastAlertMin = null; } // new session -> reset

    int elapsedMin = (int) ((now - start) / 60000L);
    int threshold = thresholds.get(fg);
    boolean alert;
    if (elapsedMin < threshold) alert = false;
    else if (lastAlertMin == null) alert = true;
    else if (!"every".equals(retriggerMode)) alert = false;
    else alert = (elapsedMin - lastAlertMin) >= retriggerEvery;

    if (alert) {
      fireAlert(fg, elapsedMin);
      lastAlertMin = elapsedMin;
    }
  }

  private void fireAlert(String pkg, int elapsedMin) {
    String label = labelFor(pkg);
    String text = elapsedMin + (elapsedMin == 1 ? " minute on " : " minutes on ") + label;
    NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_ALERT)
        .setSmallIcon(getApplicationInfo().icon)
        .setContentTitle(text)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_STATUS) // a status mirror, not an alarm/warning
        .setAutoCancel(true);
    // Optional pixel-art cue: a "sitting" avatar, if the drawable is bundled.
    int reflect = getResources().getIdentifier("ic_reflect", "drawable", getPackageName());
    if (reflect != 0) b.setLargeIcon(BitmapFactory.decodeResource(getResources(), reflect));
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
  }

  private String labelFor(String pkg) {
    try {
      return getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0)).toString();
    } catch (Exception e) {
      return pkg;
    }
  }

  private Notification buildOngoing() {
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent pi = PendingIntent.getActivity(this, 0, launch,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    return new NotificationCompat.Builder(this, CH_ONGOING)
        .setSmallIcon(getApplicationInfo().icon)
        .setContentTitle("Focus monitor active")
        .setContentText("Watching the apps you chose.")
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setOngoing(true)
        .setContentIntent(pi)
        .build();
  }

  private void createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    NotificationChannel ongoing = new NotificationChannel(CH_ONGOING, "Focus monitor", NotificationManager.IMPORTANCE_MIN);
    ongoing.setDescription("Persistent notice while the focus monitor is running.");
    NotificationChannel alert = new NotificationChannel(CH_ALERT, "Reflection alerts", NotificationManager.IMPORTANCE_HIGH);
    alert.setDescription("A factual note when a session passes your threshold.");
    nm.createNotificationChannel(ongoing);
    nm.createNotificationChannel(alert);
  }

  private void stopSelfCleanly() {
    running = false;
    if (handler != null) handler.removeCallbacksAndMessages(null);
    stopForeground(true);
    stopSelf();
  }

  @Override
  public void onDestroy() {
    running = false;
    if (handler != null) handler.removeCallbacksAndMessages(null);
    if (thread != null) thread.quitSafely();
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
