// Doomscroll → Spirit scoring (pure, OTA-tunable).
//
// The native detector only records raw session facts to a ledger. THIS module
// turns that ledger into a Spirit effect, entirely in JS, so the whole mechanic
// (magnitudes, caps, recovery) can be retuned over-the-air without a new APK.
//
// The design (agreed with the user):
//   • Reward restraint: leaving a watched app soon after the nudge grants Spirit
//     XP — but capped per day so it can't be farmed by open/close spam.
//   • Gentle, self-healing wear: bingeing past the nudge adds capped wear to
//     Spirit's *condition* (never a hard break). Wear fades slowly on its own AND
//     — the point — every quest you complete burns some down, so doing real
//     habits is what clears the doomscroll fatigue.

import { dayKey } from './util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// All the knobs in one place — change these and re-publish to retune (OTA).
export const SPIRIT_TUNING = {
  graceSec: 90,           // leave within this many sec of the nudge = restraint
  gainXp: 6,              // Spirit XP granted per restrained exit
  dailyCapXp: 18,         // max Spirit XP per day from this source (~3 exits)
  bingePastSec: 300,      // staying this long past the nudge = a binge
  wearPerBinge: 0.2,      // condition wear added per binge (0..1)
  wearMax: 0.6,           // cap — doomscroll alone can't fully break Spirit
  wearHalfLifeMs: 2 * DAY_MS, // passive self-heal half-life
  recoverPerQuest: 0.06,  // wear burned down by each quest completion
};

export function defaultSpiritTrack() {
  return { lastSeq: 0, xp: 0, wear: 0, wearAt: 0, capDay: null, capXp: 0 };
}

// Wear after passive half-life decay from its last-updated time to `now`.
// Pure: returns the value, does not mutate.
export function decayedWear(track, now) {
  if (!track || !track.wear || !track.wearAt) return 0;
  const dt = Math.max(0, now - track.wearAt);
  const factor = Math.pow(0.5, dt / SPIRIT_TUNING.wearHalfLifeMs);
  const w = track.wear * factor;
  return w < 0.005 ? 0 : w; // snap tiny residue to zero
}

// Process new ledger events into an updated track. Returns { track, gainedXp,
// addedWear } so the caller can show a transparent note. Pure (new track object).
export function applyLedger(track0, events, now, tuning = SPIRIT_TUNING) {
  const track = { ...(track0 || defaultSpiritTrack()) };
  // Start from the passively-decayed wear so old debuff has healed appropriately.
  track.wear = decayedWear(track, now);
  track.wearAt = now;

  const today = dayKey(now);
  if (track.capDay !== today) { track.capDay = today; track.capXp = 0; }

  let gainedXp = 0;
  let addedWear = 0;

  const fresh = (Array.isArray(events) ? events : [])
    .filter((e) => e && typeof e.seq === 'number' && e.seq > (track.lastSeq || 0))
    .sort((a, b) => a.seq - b.seq);

  for (const e of fresh) {
    track.lastSeq = Math.max(track.lastSeq || 0, e.seq);
    if (e.type !== 'session' || !e.watched || !e.alerted) continue;
    const left = Number(e.leftAfterAlertSec);
    if (left >= 0 && left <= tuning.graceSec) {
      // Restraint — grant XP up to the daily cap.
      const room = Math.max(0, tuning.dailyCapXp - track.capXp);
      const grant = Math.min(tuning.gainXp, room);
      if (grant > 0) { track.xp += grant; track.capXp += grant; gainedXp += grant; }
    } else if (left >= tuning.bingePastSec) {
      // Binge — add capped wear.
      const before = track.wear;
      track.wear = Math.min(tuning.wearMax, track.wear + tuning.wearPerBinge);
      addedWear += track.wear - before;
    }
  }
  return { track, gainedXp, addedWear };
}

// Called on every quest completion: burn down some wear (real effort clears the
// doomscroll fatigue). Pure (returns a new track).
export function recoverOnQuest(track0, now, tuning = SPIRIT_TUNING) {
  const track = { ...(track0 || defaultSpiritTrack()) };
  track.wear = Math.max(0, decayedWear(track, now) - tuning.recoverPerQuest);
  track.wearAt = now;
  return track;
}

// ---- read helpers used by the rest of the game --------------------------

// Bonus Spirit XP earned via restraint (folded into the Spirit attribute).
export function spiritBonusXp(state) {
  return (state && state.spiritTrack && state.spiritTrack.xp) || 0;
}

// Current wear (0..1) after passive decay — used to lower Spirit's condition.
// Zero while the doomscroll feature is disabled, so turning it off removes the
// debuff entirely (no lingering fatigue on the dot/chip).
export function spiritWear(state, now = Date.now()) {
  const on = state && state.settings && state.settings.doomscroll && state.settings.doomscroll.enabled;
  if (!on) return 0;
  return state.spiritTrack ? decayedWear(state.spiritTrack, now) : 0;
}

// A short, factual transparency line for the Config panel.
export function spiritSummary(state, now = Date.now()) {
  const xp = spiritBonusXp(state);
  const wearPct = Math.round(spiritWear(state, now) * 100);
  return `Spirit: +${xp} XP from restraint · ${wearPct}% doomscroll wear`;
}
