package com.rpgifyhabits.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Session-observer registrations don't survive a reboot, so re-register them on
 * boot if the user still has the monitor enabled. (The pre-API-29 fallback runs
 * as a foreground service, which is out of scope for boot restart here.)
 */
public class DoomscrollBootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context ctx, Intent intent) {
    if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
    if (DoomscrollObserver.supported() && DoomscrollUtil.isEnabled(ctx)) {
      DoomscrollObserver.register(ctx);
    }
  }
}
