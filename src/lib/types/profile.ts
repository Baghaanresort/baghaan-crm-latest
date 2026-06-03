export const ALL_ROLES = [
  'Sales',
  'Front Office',
  'Accounts',
  'Admin',
  'Central Store',
  'Purchase',
  'Kitchen',
  'F&B',
  'Housekeeping',
  'Maintenance',
  'Horticulture',
] as const;

export type UserRole = (typeof ALL_ROLES)[number];

export const OPERATIONAL_ROLES: ReadonlyArray<UserRole> = [
  'Central Store',
  'Purchase',
  'Kitchen',
  'F&B',
  'Housekeeping',
  'Maintenance',
  'Horticulture',
];

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
}
