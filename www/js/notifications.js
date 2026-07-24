// Local notifications — all on-device, no server, no push infrastructure.
//
// On a native Capacitor build this drives @capacitor/local-notifications.
// On plain web the plugin is absent; we degrade to a no-op (with a one-time
// console note) because the browser can't reliably fire scheduled local
// notifications without a service worker, which is out of scope for the
// Android-first target.

const CHANNEL = 'rpgify';

// Stable id ranges so re-scheduling one category never clobbers another.
const ID_BASE = { water: 100000, posture: 200000, checkin: 300000 };

function plugin() {
  const c = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return c && c.Plugins && c.Plugins.LocalNotifications;
}

let warned = false;
function warnWebOnce() {
  if (!warned) {
    warned = true;
    console.info('[notifications] Native plugin unavailable — reminders are a no-op on web. They work in the Android build.');
  }
}

export async function ensurePermission() {
  const p = plugin();
  if (!p) { warnWebOnce(); return false; }
  try {
    let res = await p.checkPermissions();
    if (res.display !== 'granted') res = await p.requestPermissions();
    return res.display === 'granted';
  } catch (e) {
    console.warn('notification permission error', e);
    return false;
  }
}

// Android 8+ requires a notification channel to exist BEFORE posting to it —
// a notification with an unknown channelId is silently dropped. Create ours
// once (idempotent) so reminders actually appear.
let channelReady = false;
export async function ensureChannel() {
  const p = plugin();
  if (!p || channelReady || !p.createChannel) return;
  try {
    await p.createChannel({
      id: CHANNEL,
      name: 'Reminders',
      description: 'Water, posture and habit reminders',
      importance: 5, // HIGH — pops a heads-up
      visibility: 1,
      vibration: true,
    });
    channelReady = true;
  } catch (e) {
    console.warn('createChannel failed', e);
  }
}

// Fire a notification a few seconds out so you can confirm the whole pipeline
// (permission + channel + display) works, without waiting for a scheduled one.
export async function testNotification() {
  const p = plugin();
  if (!p) { warnWebOnce(); return { ok: false, reason: 'web' }; }
  const granted = await ensurePermission();
  if (!granted) return { ok: false, reason: 'permission' };
  await ensureChannel();
  await p.schedule({
    notifications: [{
      id: 999001,
      title: '💧 Test reminder',
      body: 'If you can see this, reminders work! 🎉',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      channelId: CHANNEL,
    }],
  });
  return { ok: true };
}

// Spread `count` nudges across an hour: split the hour into equal buckets and
// pick a jittered minute inside each, keeping a margin off the bucket edges so
// consecutive nudges keep a real gap (never fire a minute apart, never clump).
// Returns sorted minutes, e.g. 2/hour -> ~[6..23] then ~[36..53] (>=13 min gap).
export function spreadMinutes(count, rnd = Math.random) {
  const n = Math.max(1, Math.min(4, count || 1));
  const bucket = 60 / n;
  const margin = Math.min(6, bucket * 0.25);
  const mins = [];
  for (let k = 0; k < n; k += 1) {
    const lo = k * bucket + margin;
    const hi = (k + 1) * bucket - margin;
    mins.push(Math.floor(lo + rnd() * (hi - lo)));
  }
  return mins;
}

// Build the schedule for general nudges (water/posture) across the next
// `days` days, spread evenly within each active hour, honouring perHour.
function generalSchedule(kind, cfg, activeHours, days = 3) {
  const out = [];
  const now = new Date();
  for (let d = 0; d < days; d += 1) {
    for (let h = activeHours.start; h < activeHours.end; h += 1) {
      const minutes = spreadMinutes(cfg.perHour || 1);
      minutes.forEach((minute, k) => {
        const when = new Date(now);
        when.setDate(now.getDate() + d);
        when.setHours(h, minute, 0, 0);
        if (when <= now) return;
        out.push({
          id: ID_BASE[kind] + d * 100 + h * 4 + k,
          title: kind === 'water' ? '💧 Hydrate' : '🪑 Posture check',
          body: kind === 'water' ? 'Drink some water.' : 'Sit up straight, roll your shoulders.',
          schedule: { at: when, allowWhileIdle: true },
          channelId: CHANNEL,
        });
      });
    }
  }
  return out;
}

// Weekly check-in nudge (review your habits).
function checkInSchedule(cfg) {
  if (!cfg?.enabled) return [];
  return [{
    id: ID_BASE.checkin,
    title: '📜 Weekly Review',
    body: 'Review your habits — keep, adjust cadence, or retire each one.',
    schedule: { on: { weekday: (cfg.weekday ?? 0) + 1, hour: cfg.hour ?? 9, minute: 0 } },
    channelId: CHANNEL,
  }];
}

// Cancel everything we manage and reschedule from the current settings.
export async function rescheduleAll(settings) {
  const p = plugin();
  if (!p) { warnWebOnce(); return; }
  try {
    await ensureChannel();
    const pending = await p.getPending();
    if (pending?.notifications?.length) {
      await p.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    const notifications = [];
    const { general, activeHours, checkIn } = settings;
    if (general?.water?.enabled) {
      notifications.push(...generalSchedule('water', general.water, activeHours));
    }
    if (general?.posture?.enabled) {
      notifications.push(...generalSchedule('posture', general.posture, activeHours));
    }
    notifications.push(...checkInSchedule(checkIn));
    if (notifications.length) {
      await p.schedule({ notifications });
    }
  } catch (e) {
    console.warn('reschedule error', e);
  }
}

export function notificationsSupported() {
  return !!plugin();
}
