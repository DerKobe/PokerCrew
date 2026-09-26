// Gadgets: purely cosmetic table accessories every player picks before the tournament.
// Labels live in the client translations (gadget.<id>).
export const GADGETS = [
  { id: 'cigar', icon: '🚬' },
  { id: 'vape', icon: '💨' },
  { id: 'cocktail', icon: '🍸' },
  { id: 'whiskey', icon: '🥃' },
];

export const isGadget = (id) => GADGETS.some((g) => g.id === id);

// Explicit "no gadget" choice (the default); the seat then has gadget = null
export const NO_GADGET = 'none';
export const GADGET_CHOICES = [{ id: NO_GADGET, icon: '🚫' }, ...GADGETS];
