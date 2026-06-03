'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { inviteUser } from '@/lib/actions/admin';
import { ALL_ROLES, type UserRole } from '@/lib/types/profile';

export function InviteUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ email: '', name: '', role: 'Sales' as UserRole });
  const [success, setSuccess] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.name.trim()) { toast.error('Email and name are required'); return; }

    startTransition(async () => {
      const result = await inviteUser(form);
      if (!result.success) { toast.error(result.error); return; }
      setSuccess(`Invitation sent to ${form.email}. They will receive an email to set their password.`);
      setForm({ email: '', name: '', role: 'Sales' });
    });
  };

  return (
    <div className="bg-white border border-stone-200 p-6">
      {success && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 text-sm mb-4">
          ✓ {success}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Full Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Priya Sharma"
            className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-stone-700 bg-white"
          />
        </div>
        <div>
          <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Email Address *</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="priya@example.com"
            className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-stone-700 bg-white"
          />
        </div>
        <div>
          <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Role *</label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
            className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none"
          >
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="pt-4 border-t border-stone-200 flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 text-sm bg-stone-900 hover:bg-stone-800 text-amber-100 tracking-wider disabled:opacity-50"
          >
            {isPending ? 'SENDING…' : 'SEND INVITATION'}
          </button>
        </div>
      </form>
    </div>
  );
}
