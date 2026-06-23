import type { EnquiryStatus } from '@/lib/types/enquiry';

export const ENQUIRY_SOURCES = [
  'WhatsApp',
  'Instagram',
  'Phone',
  'Website',
  'Referral',
  'Walk-in',
  'Email',
  'Other',
] as const;

export const ENQUIRY_TYPES = [
  'Weekend Stay',
  'Weekday Stay',
  'Wedding',
  'Corporate Offsite',
  'Group Booking',
  'Day Visit',
  'Mango Season',
  'Other',
] as const;

export const ENQUIRY_STATUSES: Record<
  EnquiryStatus,
  { label: string; color: string; dot: string }
> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  rooms_blocked: { label: 'Rooms Blocked', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  advance_pending: { label: 'Advance Pending', color: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  advance_confirmed: { label: 'Advance Payment Confirmed', color: 'bg-teal-100 text-teal-800', dot: 'bg-teal-600' },
  booked: { label: 'Booked', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  lost: { label: 'Lost', color: 'bg-stone-100 text-stone-600', dot: 'bg-stone-400' },
};

export const LOST_REASONS = [
  'Price too high',
  'Dates not available',
  'Chose a competitor',
  'Guest not responsive',
  'Budget cancelled / postponed',
  'Requirements not met',
  'Other',
] as const;
