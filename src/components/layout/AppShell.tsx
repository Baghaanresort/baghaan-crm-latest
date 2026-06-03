'use client';

import { UserProvider, type CurrentUser } from '@/context/UserContext';
import { AppHeader } from './AppHeader';
import { NavTabs } from './NavTabs';
import { Toaster } from 'sonner';

interface Props {
  user: CurrentUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: Props) {
  return (
    <UserProvider user={user}>
      <div
        className="min-h-screen bg-stone-50 text-stone-900"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        <header className="bg-emerald-900 text-stone-50 border-b-4 border-amber-500">
          <AppHeader />
          <NavTabs />
        </header>
        <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
      </div>
      <Toaster richColors position="top-right" />
    </UserProvider>
  );
}
