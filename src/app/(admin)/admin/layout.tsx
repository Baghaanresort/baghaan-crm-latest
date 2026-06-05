import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { UserRole } from '@/lib/types/profile';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role as UserRole) !== 'Admin') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-stone-900 text-stone-50 border-b-4 border-amber-600">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: '0.15em' }} className="text-xl">
                BAGHAAN
              </h1>
              <p className="text-xs text-amber-400 tracking-widest" style={{ letterSpacing: '0.3em' }}>ADMIN CONSOLE</p>
            </div>
            <nav className="flex gap-1">
              {[
                { href: '/admin', label: 'Overview' },
                { href: '/admin/users', label: 'Users' },
                { href: '/admin/settings', label: 'Settings' },
              ].map(({ href, label }) => (
                <Link key={href} href={href} className="px-4 py-2 text-sm text-stone-300 hover:text-stone-50 hover:bg-stone-800 transition rounded">
                  {label}
                </Link>
              ))}
              <Link href="/dashboard" className="px-4 py-2 text-sm text-amber-400 hover:text-amber-300 transition">
                ← Back to CRM
              </Link>
            </nav>
          </div>
          <div className="text-sm">
            <span className="text-stone-400 text-xs">Admin:</span>{' '}
            <span className="font-medium">{profile.name as string}</span>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
