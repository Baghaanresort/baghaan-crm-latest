import type { VegType } from '@/lib/types/menu';

// Sections the standard menu is organised into. Snacks is one of them.
export const MENU_CATEGORIES = [
  'Snacks',
  'Starters',
  'Main Course',
  'Breads & Rice',
  'Beverages',
  'Desserts',
] as const;

export const VEG_TYPES: ReadonlyArray<{ value: VegType; label: string; dot: string }> = [
  { value: 'veg', label: 'Veg', dot: 'bg-green-600' },
  { value: 'non_veg', label: 'Non-veg', dot: 'bg-red-600' },
  { value: 'none', label: 'Not specified', dot: 'bg-stone-300' },
];
