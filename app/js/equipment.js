// Equipment — now purely cosmetic. Equipped loot changes how your hero looks
// on the character sheet; it grants NO stat bonuses. All power comes from
// growing real habits → character level → skill tree.
//
// Slots hold a small snapshot of the item (not an inventory id) so they survive
// inventory churn.

export const SLOTS = ['weapon', 'head', 'body', 'offhand', 'accessory'];
export const SLOT_LABEL = {
  weapon: 'Weapon', head: 'Head', body: 'Body', offhand: 'Off-hand', accessory: 'Accessory',
};

// Which slot an item can occupy (null = not equippable, e.g. consumables).
export function slotForItem(item) {
  if (!item) return null;
  if (['sword', 'dagger', 'axe'].includes(item.shape)) return 'weapon';
  if (item.shape === 'helm') return 'head';
  if (item.shape === 'armor') return 'body';
  if (item.shape === 'shield') return 'offhand';
  if (item.type === 'Treasure') return 'accessory';
  return null;
}

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
