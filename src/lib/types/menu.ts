export type VegType = 'veg' | 'non_veg' | 'none';

export interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number | null; // null = no price shown on the menu
  vegType: VegType;
  description: string;
  sortOrder: number;
  isActive: boolean; // false = archived (kept in DB, hidden from the menu)
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}
