import { z } from 'zod';

export const EnquirySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().optional().default(''),
  phone: z.string().min(1, 'Phone / WhatsApp number is required'),
  email: z.string().email().optional().or(z.literal('')),
  source: z.string().min(1, 'Source is required'),
  enquiryType: z.string().optional().default(''),
  numberOfRooms: z.string().optional().default(''),
  preferredDates: z.string().optional().default(''),
  status: z.enum(['new', 'in_progress', 'booked', 'lost']),
  nextAction: z.string().optional().default(''),
  followupDate: z.string().nullable().optional(),
  notes: z.string().optional().default(''),
  createdBy: z.string().min(1),
});

export const UpdateEnquirySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')).optional(),
  source: z.string().optional(),
  enquiryType: z.string().optional(),
  numberOfRooms: z.string().optional(),
  preferredDates: z.string().optional(),
  status: z.enum(['new', 'in_progress', 'booked', 'lost']).optional(),
  nextAction: z.string().optional(),
  followupDate: z.string().nullable().optional(),
  notes: z.string().optional(),
  lostReason: z.string().optional(),
  lostAt: z.string().nullable().optional(),
});

export const AddActivitySchema = z.object({
  enquiryId: z.string().min(1),
  type: z.enum(['call', 'whatsapp', 'email', 'note', 'status_change', 'booking_created']),
  note: z.string().min(1, 'Note is required'),
});

export type EnquiryInput = z.infer<typeof EnquirySchema>;
export type UpdateEnquiryInput = z.infer<typeof UpdateEnquirySchema>;
export type AddActivityInput = z.infer<typeof AddActivitySchema>;
