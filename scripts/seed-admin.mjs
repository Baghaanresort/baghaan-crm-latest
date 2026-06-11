// One-off: create an Admin login in the configured Supabase project.
// Usage: node scripts/seed-admin.mjs <email> <password> [name]
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function readEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/); // ignores commented (#) lines
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const [email, password, name = 'Administrator'] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.mjs <email> <password> [name]');
  process.exit(1);
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Missing Supabase URL or service-role key in .env.local'); process.exit(1); }

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

console.log(`Target project: ${url}`);

// 1. Create (or find) the auth user.
let userId;
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { name },
});

if (createErr) {
  if (/already.*registered|already exists/i.test(createErr.message)) {
    // Find existing user and reset its password so the given creds work.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) { console.error('User exists but could not be located:', createErr.message); process.exit(1); }
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    console.log('User already existed — password reset and email confirmed.');
  } else {
    console.error('createUser failed:', createErr.message);
    process.exit(1);
  }
} else {
  userId = created.user.id;
  console.log('Auth user created.');
}

// 2. Upsert the profile row with role Admin.
const { error: profErr } = await admin
  .from('profiles')
  .upsert({ id: userId, name, role: 'Admin' }, { onConflict: 'id' });

if (profErr) {
  console.error('Profile upsert FAILED:', profErr.message);
  console.error('→ Did you run full_setup.sql yet? The profiles table must exist.');
  process.exit(1);
}

console.log('\n✅ Admin ready.');
console.log(`   Email:    ${email}`);
console.log(`   Password: ${password}`);
console.log(`   Role:     Admin   (user id ${userId})`);
