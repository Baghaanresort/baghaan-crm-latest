export type RoomCategory =
  | 'Kesar Khema'
  | 'Orchard Cottage'
  | 'Premium Orchard Cottage'
  | 'Kothi';

export const ROOM_INVENTORY: Record<RoomCategory, string[]> = {
  'Kesar Khema': Array.from({ length: 16 }, (_, i) => `Kesar Khema Room ${i + 1}`),
  'Orchard Cottage': Array.from({ length: 29 }, (_, i) => `Orchard Cottage ${i + 1}`),
  'Premium Orchard Cottage': Array.from({ length: 7 }, (_, i) => `Premium Orchard Cottage ${i + 1}`),
  'Kothi': ['Dasheri Kothi 2 Bedroom', 'Amarpali Kothi 3 Bedroom'],
};

export const DEFAULT_RATES: Record<RoomCategory, number> = {
  'Kesar Khema': 9000,
  'Orchard Cottage': 11000,
  'Premium Orchard Cottage': 14000,
  'Kothi': 22000,
};

export const ALL_ROOMS: string[] = Object.values(ROOM_INVENTORY).flat();

export const TOTAL_ROOMS = ALL_ROOMS.length; // 54

export function getRoomCategory(roomName: string): RoomCategory | 'Other' {
  if (roomName.startsWith('Kesar Khema')) return 'Kesar Khema';
  if (roomName.startsWith('Premium Orchard')) return 'Premium Orchard Cottage';
  if (roomName.startsWith('Orchard Cottage')) return 'Orchard Cottage';
  if (roomName.includes('Kothi')) return 'Kothi';
  return 'Other';
}
