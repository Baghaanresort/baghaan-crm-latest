export type CatalogueUnit = 'guest' | 'unit' | 'driver';

export interface CatalogueItem {
  name: string;
  defaultRate: number;
  unit: CatalogueUnit;
}

export type CatalogueCategory =
  | 'Accommodation'
  | 'Food & Beverage'
  | 'Banquet / Conference'
  | 'Entertainment'
  | 'Equipment & Misc';

export const LINE_ITEM_CATALOGUE: Record<CatalogueCategory, CatalogueItem[]> = {
  Accommodation: [
    { name: 'Per person — Single Share (incl meals & GST)', defaultRate: 5000, unit: 'guest' },
    { name: 'Per person — Double Share (incl meals & GST)', defaultRate: 3750, unit: 'guest' },
    { name: 'Per person — Triple Share (incl meals & GST)', defaultRate: 3250, unit: 'guest' },
  ],
  'Food & Beverage': [
    { name: 'Hi Tea — 1 veg snack (incl GST)', defaultRate: 100, unit: 'guest' },
    { name: 'Hi Tea — 2 veg snacks (incl GST)', defaultRate: 200, unit: 'guest' },
    { name: '1 veg + 1 non-veg snack, 2 hrs unlimited (incl GST)', defaultRate: 354, unit: 'guest' },
    { name: '2 veg + 1 non-veg snacks, 2 hrs unlimited (incl GST)', defaultRate: 625, unit: 'guest' },
    { name: '2 veg + 2 non-veg snacks, 2 hrs unlimited (incl GST)', defaultRate: 708, unit: 'guest' },
    { name: '3 veg + 3 non-veg snacks, 2 hrs unlimited (incl GST)', defaultRate: 1062, unit: 'guest' },
    { name: 'F&B package — sodas, soft drinks, juice 1L, ice (incl GST)', defaultRate: 295, unit: 'guest' },
    { name: 'Soft Beverages — soft drink, juices 2 hrs (incl GST)', defaultRate: 200, unit: 'guest' },
    { name: 'Extra Breakfast on arrival (curtailed menu, +GST)', defaultRate: 413, unit: 'guest' },
    { name: 'Extra Lunch / Dinner — non-resident (+GST)', defaultRate: 767, unit: 'guest' },
    { name: 'Extra Lunch on departure — curtailed menu (+GST)', defaultRate: 767, unit: 'guest' },
  ],
  'Banquet / Conference': [
    { name: 'Meeting Room 1000 sq ft — mike, stationery, projector, screen, PM tea (+18% GST)', defaultRate: 9440, unit: 'unit' },
    { name: 'Conference Hall 2000 sq ft — full setup (+18% GST)', defaultRate: 11800, unit: 'unit' },
    { name: 'Conference Hall 4000 sq ft — full setup (+18% GST)', defaultRate: 17700, unit: 'unit' },
    { name: 'Stage in conference hall — 12 x 9', defaultRate: 5000, unit: 'unit' },
    { name: 'LED Screen 8 ft H x 12 ft W — 8 hrs (+18% GST)', defaultRate: 25960, unit: 'unit' },
  ],
  Entertainment: [
    { name: 'DJ — till 10:30 PM (+18% GST)', defaultRate: 11800, unit: 'unit' },
    { name: 'Live Music / Band (+18% GST)', defaultRate: 23600, unit: 'unit' },
  ],
  'Equipment & Misc': [
    { name: 'Bonfire arrangement', defaultRate: 2500, unit: 'unit' },
    { name: 'Welcome décor / Floral arrangement', defaultRate: 5000, unit: 'unit' },
    { name: 'Photographer (full day)', defaultRate: 12000, unit: 'unit' },
    { name: 'Driver accommodation — per driver (incl meals)', defaultRate: 1500, unit: 'driver' },
    { name: 'Maid accommodation — rollout mattress (per day)', defaultRate: 3000, unit: 'unit' },
  ],
};
