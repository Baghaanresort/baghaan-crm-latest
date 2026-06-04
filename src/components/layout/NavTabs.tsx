'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  BarChart3,
  MessageCircle,
  Users,
  Building2,
  Calendar,
  Hotel,
  Wallet,
  FileText,
  UserCircle,
  TrendingUp,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { ALL_TABS } from '@/lib/constants/roles';

const TAB_ICONS: Record<string, React.ElementType> = {
  dashboard: BarChart3,
  enquiries: MessageCircle,
  bookings: Users,
  corporate: Building2,
  calendar: Calendar,
  'front-office': Hotel,
  accounts: Wallet,
  vouchers: FileText,
  guests: UserCircle,
  reports: TrendingUp,
};

export function NavTabs() {
  const pathname = usePathname();
  const permissions = usePermissions();

  const visibleTabs = useMemo(() => {
    if (!permissions) return [];
    return ALL_TABS.filter((tab) => tab.allowedFn(permissions));
  }, [permissions]);

  const SHORT_LABELS: Record<string, string> = { corporate: 'Corporate' };

  return (
    <nav className="max-w-7xl mx-auto px-4 flex">
      {visibleTabs.map(({ key, label, href }) => {
        const Icon = TAB_ICONS[key] ?? BarChart3;
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={key}
            href={href}
            prefetch
            className={`px-3 py-2.5 text-sm flex items-center gap-1.5 transition border-b-2 whitespace-nowrap ${
              isActive
                ? 'border-amber-400 text-amber-200'
                : 'border-transparent text-stone-300 hover:text-stone-50'
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {SHORT_LABELS[key] ?? label}
          </Link>
        );
      })}
    </nav>
  );
}
