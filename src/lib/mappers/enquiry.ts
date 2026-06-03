import type { Enquiry } from '@/lib/types/enquiry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToEnquiry(row: Record<string, any>): Enquiry {
  return {
    id: row['id'] as string,
    enquiryNumber: row['enquiry_number'] as number,
    date: row['date'] as string,
    name: (row['name'] as string | null) ?? '',
    phone: (row['phone'] as string | null) ?? '',
    email: (row['email'] as string | null) ?? '',
    source: (row['source'] as string | null) ?? '',
    enquiryType: (row['enquiry_type'] as string | null) ?? '',
    numberOfRooms: (row['number_of_rooms'] as string | null) ?? '',
    preferredDates: (row['preferred_dates'] as string | null) ?? '',
    status: (row['status'] as Enquiry['status']) ?? 'new',
    nextAction: (row['next_action'] as string | null) ?? '',
    followupDate: (row['followup_date'] as string | null) ?? null,
    notes: (row['notes'] as string | null) ?? '',
    createdBy: (row['created_by'] as string | null) ?? '',
    updatedBy: (row['updated_by'] as string | null) ?? '',
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
    linkedBookingId: (row['linked_booking_id'] as string | null) ?? null,
    lostReason: (row['lost_reason'] as string | null) ?? '',
    lostAt: (row['lost_at'] as string | null) ?? null,
  };
}

export function enquiryToDb(e: Enquiry): Record<string, unknown> {
  return {
    id: e.id,
    enquiry_number: e.enquiryNumber,
    date: e.date,
    name: e.name || '',
    phone: e.phone || '',
    email: e.email || '',
    source: e.source || '',
    enquiry_type: e.enquiryType || '',
    number_of_rooms: e.numberOfRooms || '',
    preferred_dates: e.preferredDates || '',
    status: e.status || 'new',
    next_action: e.nextAction || '',
    followup_date: e.followupDate || null,
    notes: e.notes || '',
    created_by: e.createdBy || '',
    updated_by: e.updatedBy || '',
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    linked_booking_id: e.linkedBookingId || null,
    lost_reason: e.lostReason || '',
    lost_at: e.lostAt || null,
  };
}
