import type { GuestCount } from '@/lib/types/booking';

// `GuestCount` holds the number of ROOMS on each sharing basis. These helpers
// derive the head-count (pax) and room totals used on the cost sheet, proforma
// invoice and corporate dashboards. Single rooms hold 1 guest, double 2, triple 3.

const EMPTY: GuestCount = { single: 0, double: 0, triple: 0 };

/** Guests per sharing basis, derived from the room counts. */
export function sharingGuests(gc: GuestCount | null | undefined): GuestCount {
  const g = gc ?? EMPTY;
  return {
    single: (g.single || 0) * 1,
    double: (g.double || 0) * 2,
    triple: (g.triple || 0) * 3,
  };
}

/** Total head-count across all sharing bases. */
export function totalGuests(gc: GuestCount | null | undefined): number {
  const g = gc ?? EMPTY;
  return (g.single || 0) * 1 + (g.double || 0) * 2 + (g.triple || 0) * 3;
}

/** Total number of rooms across all sharing bases. */
export function totalRooms(gc: GuestCount | null | undefined): number {
  const g = gc ?? EMPTY;
  return (g.single || 0) + (g.double || 0) + (g.triple || 0);
}
