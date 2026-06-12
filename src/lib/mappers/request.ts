import type { BookingRequest, PostponementPayload, RequestStatus, RequestType } from '@/lib/types/request';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToRequest(row: Record<string, any>): BookingRequest {
  const raw = row['payload'] as Record<string, unknown> | null;
  const payload: PostponementPayload | null =
    raw && raw['arrival'] && raw['departure']
      ? {
          arrival: String(raw['arrival']),
          departure: String(raw['departure']),
          nights: Number(raw['nights'] ?? 0),
        }
      : null;

  return {
    id: row['id'] as string,
    bookingId: row['booking_id'] as string,
    type: row['type'] as RequestType,
    status: row['status'] as RequestStatus,
    reason: (row['reason'] as string | null) ?? '',
    payload,
    requestedBy: row['requested_by'] as string,
    requestedAt: row['requested_at'] as string,
    decidedBy: (row['decided_by'] as string | null) ?? null,
    decidedAt: (row['decided_at'] as string | null) ?? null,
    completedBy: (row['completed_by'] as string | null) ?? null,
    completedAt: (row['completed_at'] as string | null) ?? null,
  };
}
