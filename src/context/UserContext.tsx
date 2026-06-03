'use client';

import React, { createContext, useContext } from 'react';
import type { Profile } from '@/lib/types/profile';

export type CurrentUser = Profile & { email: string };

export const UserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser | null {
  return useContext(UserContext);
}

export function UserProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: CurrentUser | null;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
