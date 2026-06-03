export type PaymentType = 'advance' | 'balance' | 'btc_receipt';

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
}
