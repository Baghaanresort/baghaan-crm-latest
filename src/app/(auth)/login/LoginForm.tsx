'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError('');

    startTransition(async () => {
      const supabase = createClient();
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authErr) {
        setError('Invalid email or password. Contact your admin if you need access.');
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profileErr || !profile) {
        await supabase.auth.signOut();
        setError('Your account has not been configured yet. Contact admin to assign your role.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full px-4 py-2.5 border border-stone-300 focus:border-emerald-700 outline-none text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="w-full px-4 py-2.5 border border-stone-300 focus:border-emerald-700 outline-none text-sm"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !email.trim() || !password}
        className="w-full bg-emerald-900 text-amber-100 py-2.5 text-sm tracking-wider hover:bg-emerald-800 disabled:opacity-40 transition"
      >
        {isPending ? 'SIGNING IN…' : 'SIGN IN'}
      </button>
    </form>
  );
}
