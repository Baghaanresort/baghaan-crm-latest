import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/dashboard');

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-stone-100"
    >
      <div className="bg-white border border-stone-200 p-10 w-full max-w-md shadow-sm">
        <div className="text-center mb-8">
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              letterSpacing: '0.2em',
            }}
            className="text-3xl text-emerald-900"
          >
            BAGHAAN
          </h1>
          <div
            className="text-xs text-amber-700 tracking-widest mt-1"
            style={{ letterSpacing: '0.3em' }}
          >
            ORCHARD · RETREAT
          </div>
          <div className="border-t border-stone-300 my-6" />
          <p className="text-sm text-stone-500 italic">Resort Operations Portal</p>
        </div>
        <LoginForm />
        <p className="text-xs text-stone-400 text-center mt-6 italic">
          Access is by invitation only. Contact your administrator to get credentials.
        </p>
      </div>
    </div>
  );
}
