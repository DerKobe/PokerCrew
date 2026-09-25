// Gadgets: purely cosmetic table accessories every player picks before the tournament.
// Labels live in the client translations (gadget.<id>).
export const GADGETS = [
  { id: 'cigar', icon: '🚬' },
  { id: 'vape', icon: '💨' },
  { id: 'cocktail', icon: '🍸' },
  { id: 'whiskey', icon: '🥃' },
];

export const isGadget = (id) => GADGETS.some((g) => g.id === id);
