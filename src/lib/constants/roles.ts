import type { UserRole } from '@/lib/types/profile';
import type { Permissions } from '@/hooks/usePermissions';

export const ROLE_COLORS: Record<UserRole, string> = {
  'Sales': 'bg-amber-600',
  'Sales Admin': 'bg-amber-800',
  'Front Office': 'bg-blue-700',
  'Accounts': 'bg-purple-700',
  'Admin': 'bg-emerald-900',
  'Central Store': 'bg-slate-600',
  'Purchase': 'bg-indigo-600',
  'Kitchen': 'bg-orange-600',
  'F&B': 'bg-rose-600',
  'Housekeeping': 'bg-teal-600',
  'Maintenance': 'bg-zinc-600',
  'Horticulture': 'bg-lime-700',
};

export const DEFAULT_TAB_BY_ROLE: Partial<Record<UserRole, string>> = {
  'Front Office': 'front-office',
  'Accounts': 'accounts',
  'Housekeeping': 'front-office',
  'Kitchen': 'bookings',
  'F&B': 'bookings',
};

export const ROLE_SUBTITLE: Record<UserRole, string> = {
  'Sales': 'Bookings, holds and your sales pipeline',
  'Sales Admin': 'Approve cancellations & postponements, plus full sales access',
  'Front Office': "Today's arrivals, in-house guests and check-outs",
  'Accounts': 'Payment verification and receivables',
  'Admin': 'Full operations overview',
  'Central Store': "Today's occupancy — plan inventory and supplies",
  'Purchase': "Today's occupancy — plan procurement",
  'Kitchen': "Today's guest count — plan meals and prep",
  'F&B': "Today's guests — plan F&B service",
  'Housekeeping': "Today's arrivals and departures — plan room turns",
  'Maintenance': "Today's occupancy — schedule maintenance",
  'Horticulture': "Today's occupancy — plan grounds and garden",
};

export interface TabDefinition {
  key: string;
  label: string;
  href: string;
  allowedFn: (p: Permissions) => boolean;
}

export const ALL_TABS: TabDefinition[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    allowedFn: () => true,
  },
  {
    key: 'enquiries',
    label: 'Enquiries',
    href: '/enquiries',
    allowedFn: (p) => p.canSeeEnquiries,
  },
  {
    key: 'bookings',
    label: 'Bookings',
    href: '/bookings',
    allowedFn: (p) => !p.isOperational || p.role === 'Kitchen' || p.role === 'F&B',
  },
  {
    key: 'corporate',
    label: 'Corporate / Groups',
    href: '/corporate',
    allowedFn: (p) =>
      p.role === 'Sales' ||
      p.role === 'Sales Admin' ||
      p.role === 'Front Office' ||
      p.role === 'Accounts' ||
      p.role === 'Admin',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    href: '/calendar',
    allowedFn: (p) =>
      p.role === 'Sales' ||
      p.role === 'Sales Admin' ||
      p.role === 'Front Office' ||
      p.role === 'Admin' ||
      p.isOperational,
  },
  {
    key: 'front-office',
    label: 'Front Office',
    href: '/front-office',
    allowedFn: (p) =>
      p.role === 'Front Office' || p.role === 'Admin' || p.role === 'Housekeeping',
  },
  {
    key: 'accounts',
    label: 'Accounts',
    href: '/accounts',
    allowedFn: (p) => p.role === 'Accounts' || p.role === 'Admin',
  },
  {
    key: 'vouchers',
    label: 'Vouchers',
    href: '/vouchers',
    allowedFn: (p) => p.canPrintVoucher,
  },
  {
    key: 'guests',
    label: 'Guests',
    href: '/guests',
    allowedFn: (p) => p.role === 'Sales' || p.role === 'Sales Admin' || p.role === 'Front Office' || p.role === 'Admin',
  },
  {
    key: 'reports',
    label: 'Reports',
    href: '/reports',
    allowedFn: (p) => p.role === 'Sales' || p.role === 'Sales Admin' || p.role === 'Accounts' || p.role === 'Admin',
  },
];
