import { z } from 'zod';

export const MenuItemSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Item name is required'),
  price: z.number().nonnegative('Price cannot be negative').nullable(),
  vegType: z.enum(['veg', 'non_veg', 'none']),
  description: z.string().default(''),
  sortOrder: z.number().int().default(0),
});

export type MenuItemInput = z.infer<typeof MenuItemSchema>;
