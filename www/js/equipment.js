// Equipment: equipped loot gives real, stacking gameplay bonuses.
//
//   Weapon / Head      -> +XP% on every completion
//   Body / Off-hand    -> decay resistance (condition drops slower)
//   Accessory (gems)   -> loot luck (better drops)
//
// Kept in its own module (no game/condition imports) so both game.js and
// condition.js can read the bonuses without an import cycle. Slots hold a small
// snapshot of the item, not an inventory id, so they survive inventory churn.

const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
function idx(rarity) { return Math.max(0, RANK.indexOf(rarity)); }

export const SLOTS = ['weapon', 'head', 'body', 'offhand', 'accessory'];
export const SLOT_LABEL = {
  weapon: 'Weapon', head: 'Head', body: 'Body', offhand: 'Off-hand', accessory: 'Accessory',
};

// Which slot an item can go in (null = not equippable, e.g. consumables).
export function slotForItem(item) {
  if (!item) return null;
  if (['sword', 'dagger', 'axe'].includes(item.shape)) return 'weapon';
  if (item.shape === 'helm') return 'head';
  if (item.shape === 'armor') return 'body';
  if (item.shape === 'shield') return 'offhand';
  if (item.type === 'Treasure') return 'accessory';
  return null; // potions etc.
}

// The bonus a single equipped item confers, by slot + rarity.
export function itemBonus(item) {
  if (!item) return {};
  const i = idx(item.rarity);
  switch (slotForItem(item)) {
    case 'weapon': return { xpPct: [5, 8, 12, 18, 25][i] };
    case 'head': return { xpPct: [3, 5, 7, 10, 14][i] };
    case 'body': return { decayResist: [0.08, 0.14, 0.20, 0.30, 0.40][i] };
    case 'offhand': return { decayResist: [0.06, 0.10, 0.16, 0.24, 0.34][i] };
    case 'accessory': return { luck: [0.03, 0.06, 0.10, 0.16, 0.24][i] };
    default: return {};
  }
}

// Aggregate every equipped item into effective bonuses.
export function equipmentBonuses(state) {
  const eq = state.equipment || {};
  let xpPct = 0; let decayResist = 0; let luck = 0;
  for (const slot of SLOTS) {
    const b = itemBonus(eq[slot]);
    xpPct += b.xpPct || 0;
    decayResist += b.decayResist || 0;
    luck += b.luck || 0;
  }
  return {
    xpPct,
    xpMult: 1 + xpPct / 100,
    decayResist: Math.min(0.7, decayResist), // never fully immune
    luck: Math.min(0.4, luck),
  };
}

// Equip an item snapshot into its slot. Returns the slot, or null if it can't
// be equipped. Replaces whatever was in that slot.
export function equipItem(state, item) {
  const slot = slotForItem(item);
  if (!slot) return null;
  if (!state.equipment) state.equipment = emptyEquipment();
  state.equipment[slot] = {
    key: item.key, name: item.name, type: item.type, shape: item.shape,
    rarity: item.rarity, color: item.color,
  };
  return slot;
}

export function unequipSlot(state, slot) {
  if (state.equipment) state.equipment[slot] = null;
}

export function isKeyEquipped(state, key) {
  const eq = state.equipment || {};
  return SLOTS.some((s) => eq[s] && eq[s].key === key);
}

export function emptyEquipment() {
  return { weapon: null, head: null, body: null, offhand: null, accessory: null };
}
