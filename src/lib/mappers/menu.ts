import type { MenuItem, VegType } from '@/lib/types/menu';

export function dbToMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id: row['id'] as string,
    category: (row['category'] as string) ?? '',
    name: (row['name'] as string) ?? '',
    price: row['price'] == null ? null : Number(row['price']),
    vegType: ((row['veg_type'] as VegType) ?? 'none'),
    description: (row['description'] as string) ?? '',
    sortOrder: Number(row['sort_order'] ?? 0),
    isActive: row['is_active'] !== false,
    createdBy: (row['created_by'] as string) ?? '',
    createdAt: (row['created_at'] as string) ?? '',
    updatedBy: (row['updated_by'] as string) ?? '',
    updatedAt: (row['updated_at'] as string) ?? '',
  };
}

export function menuItemToDb(m: Partial<MenuItem>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (m.id !== undefined) out['id'] = m.id;
  if (m.category !== undefined) out['category'] = m.category;
  if (m.name !== undefined) out['name'] = m.name;
  if (m.price !== undefined) out['price'] = m.price;
  if (m.vegType !== undefined) out['veg_type'] = m.vegType;
  if (m.description !== undefined) out['description'] = m.description;
  if (m.sortOrder !== undefined) out['sort_order'] = m.sortOrder;
  if (m.isActive !== undefined) out['is_active'] = m.isActive;
  if (m.createdBy !== undefined) out['created_by'] = m.createdBy;
  if (m.createdAt !== undefined) out['created_at'] = m.createdAt;
  if (m.updatedBy !== undefined) out['updated_by'] = m.updatedBy;
  if (m.updatedAt !== undefined) out['updated_at'] = m.updatedAt;
  return out;
}
