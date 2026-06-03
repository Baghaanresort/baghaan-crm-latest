import { z } from 'zod';
import { ALL_ROLES } from '@/lib/types/profile';

export const InviteUserSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(ALL_ROLES, 'Invalid role'),
});

export const UpdateRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ALL_ROLES, 'Invalid role'),
});

export const UpdateCounterSchema = z.object({
  key: z.enum(['booking_counter', 'pi_counter', 'enquiry_counter']),
  value: z.number().int().min(0),
});

export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type UpdateCounterInput = z.infer<typeof UpdateCounterSchema>;
