export type EnquiryStatus =
  | 'new'
  | 'in_progress'
  | 'rooms_blocked'
  | 'advance_pending'
  | 'advance_confirmed'
  | 'booked'
  | 'lost';
export type ActivityType = 'call' | 'whatsapp' | 'email' | 'note' | 'status_change' | 'booking_created';

export interface Enquiry {
  id: string;
  enquiryNumber: number;
  date: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  enquiryType: string;
  numberOfRooms: string;
  preferredDates: string;
  status: EnquiryStatus;
  nextAction: string;
  followupDate: string | null;
  notes: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  linkedBookingId: string | null;
  heldBookingId: string | null;
  lostReason: string;
  lostAt: string | null;
}

export interface EnquiryActivity {
  id: string;
  enquiryId: string;
  type: ActivityType;
  note: string;
  createdBy: string;
  createdAt: string;
}
