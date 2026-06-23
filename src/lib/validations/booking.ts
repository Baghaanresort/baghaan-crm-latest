import { z } from 'zod';
import { phoneSchema } from './phone';

export const AddOnSchema = z.object({
  name: z.string().default(''),
  pricePerUnit: z.number().min(0).default(0),
  units: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
});

export const RoomChargeSchema = z.object({
  roomType: z.string().default(''),
  roomPrice: z.number().min(0).default(0),
  numberOfRooms: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
});

export const CheckInDetailsSchema = z.object({
  adults: z.number().int().min(0).default(0),
  childBelow6: z.number().int().min(0).default(0),
  child6to12: z.number().int().min(0).default(0),
  child12to18: z.number().int().min(0).default(0),
  roomsAssigned: z.number().int().min(0).default(0),
  roomNumbers: z.array(z.string()).default([]),
});
export type CheckInDetailsInput = z.infer<typeof CheckInDetailsSchema>;

export const BookingSchema = z
  .object({
    guestName: z.string().min(1, 'Guest name is required'),
    contactNumber: phoneSchema,
    email: z.string().email().optional().or(z.literal('')),
    companyName: z.string().optional().default(''),
    gstNumber: z.string().optional().default(''),
    arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    departure: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    nights: z.number().int().min(1),
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
    rooms: z.array(z.string()).min(1, 'Select at least one room'),
    totalAmount: z.number().min(0),
    addOns: z.array(AddOnSchema).optional().default([]),
    roomCharges: z.array(RoomChargeSchema).optional().default([]),
    advancePaid: z.number().min(0),
    rateBreakdown: z.string().optional().default(''),
    inclusions: z.string().optional().default(''),
    remarks: z.string().optional().default(''),
    specialRequests: z.string().optional().default(''),
    createdBy: z.string().min(1),
    status: z.enum(['confirmed', 'hold']),
    holdExpiresAt: z.string().nullable().optional(),
    bookingType: z.enum(['regular', 'corporate']).default('regular'),
  })
  .refine((data) => data.departure > data.arrival, {
    message: 'Departure must be after arrival',
    path: ['departure'],
  });

export const PaymentSchema = z.object({
  bookingId: z.string().min(1),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive('Amount must be greater than 0'),
  mode: z.string().min(1),
  reference: z.string().optional().default(''),
  type: z.enum(['advance', 'balance', 'btc_receipt']),
  notes: z.string().optional().default(''),
  // Package total captured at the PAY step for enquiry-linked holds (which may
  // have been blocked without a quote). Optional here; required server-side for
  // those holds. Ignored for bookings that already carry a total.
  totalAmount: z.number().min(0).optional(),
});

export const FinalBillSchema = z.object({
  bookingId: z.string().min(1),
  billNumber: z.string().min(1, 'Bill number is required'),
  totalAmount: z.number().positive('Total amount must be greater than 0'),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isBTC: z.boolean().default(false),
  notes: z.string().optional().default(''),
});

export const BlockRoomSchema = z
  .object({
    guestName: z.string().min(1, 'Guest name is required'),
    contactNumber: phoneSchema,
    arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    departure: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    nights: z.number().int().min(1),
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
    rooms: z.array(z.string()).min(1, 'Select at least one room to block'),
    quotedAmount: z.number().min(0).optional().default(0),
    addOns: z.array(AddOnSchema).optional().default([]),
    roomCharges: z.array(RoomChargeSchema).optional().default([]),
    notes: z.string().optional().default(''),
    createdBy: z.string().min(1),
    holdExpiresAt: z.string().nullable().optional(),
    sourceEnquiryId: z.string().nullable().optional(),
  })
  .refine((data) => data.departure > data.arrival, {
    message: 'Departure must be after arrival',
    path: ['departure'],
  });

export type BookingInput = z.infer<typeof BookingSchema>;
export type PaymentInput = z.infer<typeof PaymentSchema>;
export type FinalBillInput = z.infer<typeof FinalBillSchema>;
export type BlockRoomInput = z.infer<typeof BlockRoomSchema>;
