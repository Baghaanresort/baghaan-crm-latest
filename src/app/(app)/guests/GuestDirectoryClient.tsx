'use client';

import { useState, useMemo } from 'react';
import { Search, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { fmtDate } from '@/lib/utils/date';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import { MessageCircle } from 'lucide-react';

interface GuestRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  companyName: string;
  createdAt: string;
  totalStays: number;
  totalSpend: number;
}

export function GuestDirectoryClient({ guests }: { guests: GuestRow[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return guests;
    const q = search.toLowerCase();
    return guests.filter(g => `${g.name} ${g.phone} ${g.email} ${g.companyName}`.toLowerCase().includes(q));
  }, [guests, search]);

  const returning = guests.filter(g => g.totalStays > 1).length;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
            Guest Directory
          </h2>
          <p className="text-sm text-stone-500 italic">
            {guests.length} guests · {returning} returning
          </p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-3 text-stone-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, company..."
          className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700"
        />
      </div>

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-emerald-900 text-amber-100">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Guest</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Contact</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Company</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Stays</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Total Spend</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Since</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(g => (
              <tr key={g.id} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {g.totalStays > 1 && (
                      <span className="text-xs bg-emerald-100 text-emerald-800 px-1.5 py-0.5">↩ {g.totalStays}x</span>
                    )}
                    <Link href={`/guests/${g.id}`} className="font-medium hover:text-emerald-700 hover:underline">
                      {g.name}
                    </Link>
                  </div>
                </td>
                <td className="p-3 text-xs">
                  <a
                    href={buildWaLink(g.phone, WA_TEMPLATES.enquiryGreeting(g.name))}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-stone-600 hover:text-green-700"
                  >
                    <MessageCircle size={11} /> {g.phone}
                  </a>
                  {g.email && <div className="text-stone-400">{g.email}</div>}
                </td>
                <td className="p-3 text-xs text-stone-500">{g.companyName || '—'}</td>
                <td className="p-3 text-right">
                  <span className={g.totalStays > 1 ? 'font-medium text-emerald-700' : 'text-stone-500'}>
                    {g.totalStays}
                  </span>
                </td>
                <td className="p-3 text-right text-xs">
                  {g.totalSpend > 0 ? `₹${g.totalSpend.toLocaleString('en-IN')}` : '—'}
                </td>
                <td className="p-3 text-xs text-stone-500">{fmtDate(g.createdAt)}</td>
                <td className="p-3 text-right">
                  <Link href={`/guests/${g.id}`} className="text-xs text-emerald-700 hover:underline">
                    View Profile →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center text-stone-400 italic">No guests found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
