'use client';

import { useContext } from 'react';
import { UserContext } from '@/context/UserContext';

export function useCurrentUser() {
  return useContext(UserContext);
}
