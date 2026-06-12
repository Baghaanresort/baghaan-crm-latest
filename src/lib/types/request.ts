export type RequestType = 'cancellation' | 'postponement';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

// New dates a postponement asks for. Null for cancellation requests.
export interface PostponementPayload {
  arrival: string;
  departure: string;
  nights: number;
}

export interface BookingRequest {
  id: string;
  bookingId: string;
  type: RequestType;
  status: RequestStatus;
  reason: string;
  payload: PostponementPayload | null;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
}
