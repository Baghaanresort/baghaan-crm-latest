'use client';

import { useState } from 'react';
import { LogOut, X, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/context/UserContext';
import { ROLE_COLORS, ROLE_SUBTITLE } from '@/lib/constants/roles';
import dynamic from 'next/dynamic';

const NotificationBell = dynamic(
  () => import('@/components/notifications/NotificationBell').then(m => ({ default: m.NotificationBell })),
  { ssr: false }
);

export function AppHeader() {
  const user = useCurrentUser();
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!user) return null;

  const roleColor = ROLE_COLORS[user.role] ?? 'bg-stone-600';
  const subtitle = ROLE_SUBTITLE[user.role] ?? '';

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div>
        <h1
          className="text-2xl tracking-wide text-stone-50"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: '0.15em' }}
        >
          BAGHAAN
        </h1>
        <p className="text-xs text-amber-200 tracking-widest" style={{ letterSpacing: '0.3em' }}>
          ORCHARD · RETREAT · CRM
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="text-right hidden sm:block">
          <div className="text-xs text-stone-300">Logged in as</div>
          <div className="text-stone-50 font-medium flex items-center gap-2 justify-end">
            {user.name}
            <span className={`text-xs px-2 py-0.5 rounded ${roleColor} text-white`}>
              {user.role}
            </span>
          </div>
          {subtitle && (
            <div className="text-xs text-stone-400 italic mt-0.5 max-w-xs truncate">{subtitle}</div>
          )}
        </div>

        <NotificationBell userId={user.id} />

        {/* Logout with inline confirmation */}
        {confirmLogout ? (
          <div className="flex items-center gap-1 bg-emerald-800 rounded px-2 py-1">
            <span className="text-xs text-stone-200 whitespace-nowrap">Sign out?</span>
            <button
              onClick={handleSignOut}
              className="p-1 hover:bg-emerald-700 rounded text-emerald-200 hover:text-white transition"
              title="Yes, sign out"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              className="p-1 hover:bg-emerald-700 rounded text-stone-400 hover:text-white transition"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            className="p-2 hover:bg-emerald-800 rounded transition text-stone-50"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
