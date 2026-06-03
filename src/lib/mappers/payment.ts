import type { Payment } from '@/lib/types/payment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToPayment(row: Record<string, any>): Payment {
  return {
    id: row['id'] as string,
    bookingId: row['booking_id'] as string,
    paymentDate: row['payment_date'] as string,
    amount: Number(row['amount']),
    mode: row['mode'] as string,
    reference: (row['reference'] as string | null) ?? '',
    type: row['type'] as Payment['type'],
    notes: (row['notes'] as string | null) ?? '',
    verified: Boolean(row['verified']),
    verifiedBy: (row['verified_by'] as string | null) ?? null,
    verifiedAt: (row['verified_at'] as string | null) ?? null,
    recordedAt: row['recorded_at'] as string,
    recordedBy: row['recorded_by'] as string,
    recordedByRole: (row['recorded_by_role'] as string) ?? '',
  };
}

export function paymentToDb(p: Payment): Record<string, unknown> {
  return {
    id: p.id,
    booking_id: p.bookingId,
    payment_date: p.paymentDate,
    amount: p.amount,
    mode: p.mode,
    reference: p.reference || '',
    type: p.type,
    notes: p.notes || '',
    verified: p.verified || false,
    verified_by: p.verifiedBy || null,
    verified_at: p.verifiedAt || null,
    recorded_at: p.recordedAt,
    recorded_by: p.recordedBy,
    recorded_by_role: p.recordedByRole,
  };
}
