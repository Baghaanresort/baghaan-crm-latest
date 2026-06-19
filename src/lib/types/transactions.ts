import type {
  PaymentLinkPurpose, PaymentLinkStatus, OutboundChannel, OutboundPurpose, OutboundStatus,
} from '@/lib/constants/transactions';

export interface PaymentLink {
  id: string;
  bookingId: string;
  enquiryId: string | null;
  purpose: PaymentLinkPurpose;
  referenceId: string;
  razorpayLinkId: string | null;
  shortUrl: string | null;
  amount: number;        // paise
  amountPaid: number;    // paise
  currency: string;
  status: PaymentLinkStatus;
  expiresAt: string | null;
  notes: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
}

export interface OutboundMessage {
  id: string;
  bookingId: string | null;
  enquiryId: string | null;
  channel: OutboundChannel;
  purpose: OutboundPurpose;
  template: string | null;
  destination: string;
  provider: string | null;
  providerMessageId: string | null;
  status: OutboundStatus;
  error: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
