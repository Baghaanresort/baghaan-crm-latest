import type { AddOn, RoomCharge, Booking, BookingPaymentStatus, EffectiveStatus } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

// Sum of every add-on line's total. Add-ons roll into a booking's package total.
export function addOnsTotal(addOns: AddOn[] | null | undefined): number {
  return (addOns ?? []).reduce((s, a) => s + (Number(a.total) || 0), 0);
}

// Sum of every room-charge line's total (Room Price × No. of Rooms).
export function roomChargesTotal(rows: RoomCharge[] | null | undefined): number {
  return (rows ?? []).reduce((s, r) => s + (Number(r.total) || 0), 0);
}

export function getEffectiveStatus(booking: Booking, payments: Payment[]): EffectiveStatus {
  // Refunds are outgoing money — never count them as "paid" toward a reservation.
  const bookingPayments = payments.filter((p) => p.bookingId === booking.id && p.type !== 'refund');
  // Verification removed: every non-refund payment counts immediately.
  const totalPaid = bookingPayments.reduce((s, p) => s + p.amount, 0);
  const totalUnverified = 0;

  if (booking.bookingType === 'corporate') {
    const stage = booking.corporateStage;
    // Advance paid onward = a real, room-consuming reservation.
    if (stage === 'advance_paid' || stage === 'confirmed' || stage === 'checked_in' || stage === 'completed') return 'confirmed';
    if (stage === 'cost_sheet_accepted' || stage === 'pi_generated') {
      if (totalPaid > 0) return 'confirmed';
      if (totalUnverified > 0) return 'pending_verification';
      return 'hold';
    }
    return 'hold';
  }

  // A checked-in / checked-out guest is unambiguously a real reservation.
  if (booking.status === 'confirmed' || booking.status === 'checked_in' || booking.status === 'checked_out') return 'confirmed';
  if (totalPaid > 0) return 'confirmed';
  if (totalUnverified > 0) return 'pending_verification';
  return 'hold';
}

export function getBookingPaymentStatus(
  booking: Booking,
  payments: Payment[]
): BookingPaymentStatus {
  const allForBooking = payments.filter((p) => p.bookingId === booking.id);
  // Incoming payments drive paid/balance; refunds are tracked separately as outflow.
  const bookingPayments = allForBooking.filter((p) => p.type !== 'refund');
  // Verification removed: every non-refund payment counts toward paid/balance immediately.
  const totalPaid = bookingPayments.reduce((s, p) => s + p.amount, 0);
  const totalUnverified = 0;
  const totalRefunded = allForBooking
    .filter((p) => p.type === 'refund' && p.refundStatus === 'done')
    .reduce((s, p) => s + p.amount, 0);
  const hasFinalBill =
    !!booking.finalBill && Number(booking.finalBill.totalAmount ?? 0) > 0;
  const billAmount = hasFinalBill
    ? booking.finalBill!.totalAmount
    : booking.totalAmount;
  const balance = billAmount - totalPaid;
  // Corporate deals carry the target on the proforma invoice; regular holds use the
  // booking-level "advance to be paid".
  const advanceRequired = Number(booking.proformaInvoice?.advanceRequired ?? booking.advanceRequired ?? 0);
  const advanceShortfall = Math.max(0, advanceRequired - totalPaid);
  return {
    totalPaid,
    totalUnverified,
    totalRefunded,
    billAmount,
    balance,
    hasFinalBill,
    advanceRequired,
    advanceShortfall,
  };
}

export function generateConfirmationNumber(counter: number): string {
  const initials = 'HO';
  const yr = String(new Date().getFullYear()).slice(-2);
  return `BOR/${initials}/${yr}/${String(counter).padStart(3, '0')}`;
}
