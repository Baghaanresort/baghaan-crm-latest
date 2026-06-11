'use client';

import { useCurrentUser } from '@/context/UserContext';
import { OPERATIONAL_ROLES, type UserRole } from '@/lib/types/profile';

export function usePermissions() {
  const user = useCurrentUser();
  const role = user?.role;

  if (!role) return null;

  const isAdmin = role === 'Admin';
  const isSales = role === 'Sales';
  const isFO = role === 'Front Office';
  const isAccounts = role === 'Accounts';
  const isOp = OPERATIONAL_ROLES.includes(role as UserRole);

  return {
    canCreateBooking: isSales || isFO || isAdmin,
    canEditBooking: isSales || isFO || isAdmin,
    canCancelBooking: isSales || isAdmin,
    canAddPayment: isSales || isFO || isAdmin,
    canAutoVerify: isFO,
    canVerifyPayment: isAccounts || isAdmin,
    canRecordFinalBill: isFO || isAdmin,
    canPrintVoucher: isSales || isFO || isAdmin,
    canAddBTCReceipt: isAccounts || isAdmin,
    canCreateCorporate: isSales || isAdmin,
    canDeleteCorporate: isSales || isAdmin,
    canSeeEnquiries: isSales || isAdmin,
    canManageUsers: isAdmin,
    isReadOnly: isAccounts || isOp,
    isOperational: isOp,
    role,
  } as const;
}

export type Permissions = NonNullable<ReturnType<typeof usePermissions>>;
