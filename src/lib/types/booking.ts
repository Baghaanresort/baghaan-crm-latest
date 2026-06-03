export type BookingStatus = 'confirmed' | 'hold' | 'checked_in' | 'checked_out' | 'cancelled';
export type BookingType = 'regular' | 'corporate';
export type CorporateStage =
  | 'inquiry'
  | 'cost_sheet_draft'
  | 'cost_sheet_sent'
  | 'cost_sheet_accepted'
  | 'pi_generated'
  | 'advance_paid'
  | 'completed';
export type EffectiveStatus = 'confirmed' | 'hold' | 'pending_verification';

export interface GuestCount {
  single: number;
  double: number;
  triple: number;
}

export interface LineItem {
  day: string;
  dayLabel: string;
  particular: string;
  rate: number;
  qty: number;
  units: number;
  total: number;
  category: string;
}

export interface CostSheet {
  lineItems: LineItem[];
  grandTotal: number;
  notes: string;
  inclusions: string[];
  terms: string;
  version: number;
  sentAt?: string;
  sentBy?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ProformaInvoice {
  piNumber: string;
  generatedAt: string;
  generatedBy: string;
  lineItems: LineItem[];
  grandTotal: number;
  advanceRequired: number;
  paymentTerms: string;
  billingEntity: string;
}

export interface FinalBill {
  billNumber: string;
  totalAmount: number;
  billDate: string;
  isBTC: boolean;
  notes: string;
  recordedAt: string;
  recordedBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Booking {
  id: string;
  confirmationNumber: string;
  guestName: string;
  contactNumber: string;
  email: string;
  companyName: string;
  gstNumber: string;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  rooms: string[];
  rateBreakdown: string;
  totalAmount: number;
  advancePaid: number;
  inclusions: string;
  remarks: string;
  specialRequests: string;
  createdBy: string;
  status: BookingStatus;
  holdExpiresAt: string | null;
  finalBill: FinalBill | null;
  createdAt: string;
  bookingType: BookingType;
  corporateStage: CorporateStage | null;
  companyAddress: string;
  companyGST: string;
  contactName: string;
  contactEmail: string;
  guestCount: GuestCount | null;
  costSheet: CostSheet | null;
  proformaInvoice: ProformaInvoice | null;
  sourceEnquiryId: string | null;
  guestId: string | null;
}

export interface BookingPaymentStatus {
  totalPaid: number;
  totalUnverified: number;
  billAmount: number;
  balance: number;
  hasFinalBill: boolean;
  advanceRequired: number;
  advanceShortfall: number;
}
