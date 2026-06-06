'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      const ALLOWED_ROLES = ['Admin', 'Sales', 'Accounts', 'Front Office'];
      if (!ALLOWED_ROLES.includes(profile.role as string)) {
        await supabase.auth.signOut();
        setError('Access restricted. Please contact your administrator.');
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
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-4 py-2.5 pr-10 border border-stone-300 focus:border-emerald-700 outline-none text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
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
