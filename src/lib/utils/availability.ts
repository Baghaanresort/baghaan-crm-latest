import type { Booking } from '@/lib/types/booking';
import { ROOM_INVENTORY, DEFAULT_RATES, type RoomCategory } from '@/lib/constants/rooms';

export interface MaintenanceLike {
  roomName: string;
  dateFrom: string;
  dateTo: string;
}

export interface TypeAvailability {
  category: RoomCategory;
  total: number;
  free: number;
  onHold: number;
  confirmed: number;
  rate: number;
}

const CATEGORIES: RoomCategory[] = ['Kesar Khema', 'Orchard Cottage', 'Premium Orchard Cottage', 'Kothi'];

// Per-room-type availability for the stay [checkIn, checkOut). A unit is "free" only
// if no overlapping booking/maintenance ties it up for any night of the range.
export function computeAvailability(
  bookings: Booking[],
  maintenance: MaintenanceLike[],
  checkIn: string,
  checkOut: string,
): TypeAvailability[] {
  // Half-open overlap (checkout/dateTo day frees the room). Same rule as checkRoomConflict.
  const overlaps = (start: string, end: string) => start < checkOut && end > checkIn;

  const confirmedUnits = new Set<string>();
  const heldUnits = new Set<string>();

  // Invalid range → nothing tied up (caller's modal also guards this).
  if (checkIn < checkOut) {
    for (const bk of bookings) {
      if (bk.status === 'cancelled') continue;
      if (!overlaps(bk.arrival, bk.departure)) continue;
      const isConfirmed = bk.status === 'confirmed' || bk.status === 'checked_in' || bk.status === 'checked_out';
      for (const room of bk.rooms ?? []) {
        if (isConfirmed) confirmedUnits.add(room);
        else if (bk.status === 'hold') heldUnits.add(room);
      }
    }
    for (const m of maintenance) {
      if (overlaps(m.dateFrom, m.dateTo)) confirmedUnits.add(m.roomName);
    }
  }

  return CATEGORIES.map((category) => {
    const units = ROOM_INVENTORY[category];
    let free = 0, onHold = 0, confirmed = 0;
    for (const unit of units) {
      if (confirmedUnits.has(unit)) confirmed++;        // confirmed/maintenance wins over hold
      else if (heldUnits.has(unit)) onHold++;
      else free++;
    }
    return { category, total: units.length, free, onHold, confirmed, rate: DEFAULT_RATES[category] };
  });
}
