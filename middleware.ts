import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/api/auth/callback'];
const ADMIN_ROUTES = ['/admin'];

// Skip middleware for static assets and API export/print routes (no auth needed at edge)
const SKIP_ROUTES = ['/api/export', '/api/print'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip entirely for export/print API routes — auth is checked inside the handler
  if (SKIP_ROUTES.some(r => path.startsWith(r))) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public routes — redirect to dashboard if already authed
  if (PUBLIC_ROUTES.some(r => path.startsWith(r))) {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url));
    return supabaseResponse;
  }

  // All other routes require auth
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Admin DB check — only fires on /admin/* routes (not every request)
  if (ADMIN_ROUTES.some(r => path.startsWith(r))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'Admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
