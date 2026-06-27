// Resort-wide activity lists shown on the corporate Cost Sheet and Proforma Invoice.
// Single source of truth so both documents (HTML print + PDF) stay in sync.

export interface PaidActivity {
  name: string;
  rate: number;
  /** Human-readable basis for the rate, e.g. "per person", "per game". */
  unit: string;
}

/** Activities included free in the package cost. */
export const INCLUDED_ACTIVITIES: string[] = [
  'Swimming Pool (swimming costumes mandatory)',
  'Volleyball',
  'Badminton',
  'Table Tennis',
  'Bullock Cart Ride',
  'Pottery Session',
  'Tug of War',
  'Cricket',
];

/** Optional activities chargeable on-site (informational rate card — not added to the total). */
export const PAID_ACTIVITIES: PaidActivity[] = [
  { name: 'Pool Table', rate: 200, unit: 'per person / 45 min' },
  { name: 'Zip Line', rate: 600, unit: 'per person' },
  { name: 'Wall Climbing', rate: 400, unit: 'per person' },
  { name: 'Cycling', rate: 350, unit: 'per person / 45 min' },
  { name: 'Rappelling', rate: 400, unit: 'per person' },
  { name: 'Air Hockey', rate: 200, unit: 'per game' },
  { name: 'Target Shooting', rate: 300, unit: 'per person / 20 balls' },
  { name: 'Paintball', rate: 800, unit: 'per person / 40 balls' },
];
