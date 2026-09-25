// Gadgets: rein kosmetische Tisch-Accessoires, die jeder Spieler vor dem Turnier wählt.
export const GADGETS = [
  { id: 'cigar', label: 'Zigarre', icon: '🚬' },
  { id: 'vape', label: 'Vape', icon: '💨' },
  { id: 'cocktail', label: 'Cocktail', icon: '🍸' },
  { id: 'whiskey', label: 'Whiskey', icon: '🥃' },
];

export const isGadget = (id) => GADGETS.some((g) => g.id === id);
