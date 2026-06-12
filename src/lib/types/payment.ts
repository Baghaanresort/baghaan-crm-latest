export type PaymentType = 'advance' | 'balance' | 'btc_receipt' | 'refund';
export type RefundStatus = 'pending' | 'done';

export interface Payment {
  id: string;
  bookingId: string;
  paymentDate: string;
  amount: number;
  mode: string;
  reference: string;
  type: PaymentType;
  notes: string;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  recordedAt: string;
  recordedBy: string;
  recordedByRole: string;
  // Only set for `type === 'refund'`: tracks the outgoing-money lifecycle
  // (pending → done) shown in the Accounts Refund tab. Null for incoming payments.
  refundStatus: RefundStatus | null;
}
