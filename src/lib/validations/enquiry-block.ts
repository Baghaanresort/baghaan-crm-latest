import { z } from 'zod';
import { AddOnSchema } from './booking';

export const EnquiryBlockSchema = z
  .object({
    arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    departure: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    nights: z.number().int().min(1),
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
    rooms: z.array(z.string()).min(1, 'Select at least one room to block'),
    quotedAmount: z.number().min(0).optional().default(0),
    addOns: z.array(AddOnSchema).optional().default([]),
    notes: z.string().optional().default(''),
    holdExpiresAt: z.string().nullable().optional(),
  })
  .refine((d) => d.departure > d.arrival, { message: 'Departure must be after arrival', path: ['departure'] });

export type EnquiryBlockInput = z.infer<typeof EnquiryBlockSchema>;
