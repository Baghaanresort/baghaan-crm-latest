// One-off: create the four login-capable accounts (Admin, Sales, Accounts,
// Front Office) in the configured Supabase project. Idempotent — re-running
// resets passwords and re-confirms emails so the listed creds always work.
// Usage: node scripts/seed-users.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Only these four roles can log in to the CRM. Admin + Front Office creds come
// straight from the resort's credential sheet; Sales + Accounts follow the same
// role@baghaan.com / Role@Baghaan1 convention. The profile name is set to the
// role (the column needs a value; no personal names are used).
const USERS = [
  { email: 'anirudh@baghaan.com',  password: 'Anirudh@19',          role: 'Admin' },
  { email: 'sales@baghaan.com',    password: 'Sales@Baghaan1',      role: 'Sales' },
  { email: 'accounts@baghaan.com', password: 'Accounts@Baghaan1',   role: 'Accounts' },
  { email: 'fo@baghaan.com',       password: 'FrontOffice@Baghaan1', role: 'Front Office' },
];

function readEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/); // ignores commented (#) lines
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Missing Supabase URL or service-role key in .env.local'); process.exit(1); }

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
console.log(`Target project: ${url}\n`);

let failed = 0;
for (const { email, password, role } of USERS) {
  const name = role; // column needs a value; no personal names used
  // 1. Create (or find + reset) the auth user.
  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });

  if (createErr) {
    if (/already.*registered|already exists/i.test(createErr.message)) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) { console.error(`x ${email}: exists but could not be located - ${createErr.message}`); failed++; continue; }
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      console.log(`= ${role.padEnd(12)} ${email} - existed, password reset.`);
    } else {
      console.error(`x ${email}: createUser failed - ${createErr.message}`); failed++; continue;
    }
  } else {
    userId = created.user.id;
    console.log(`+ ${role.padEnd(12)} ${email} - auth user created.`);
  }

  // 2. Upsert the profile row with the correct role.
  const { error: profErr } = await admin
    .from('profiles')
    .upsert({ id: userId, name, role }, { onConflict: 'id' });
  if (profErr) {
    console.error(`x ${email}: profile upsert FAILED - ${profErr.message}`);
    console.error('  -> Did you run full_setup.sql yet? The profiles table must exist.');
    failed++;
  }
}

if (failed) { console.error(`\n${failed} account(s) failed.`); process.exit(1); }
console.log('\nAll four login accounts ready:');
console.log('  ROLE          USERNAME                  PASSWORD');
for (const u of USERS) console.log(`  ${u.role.padEnd(13)} ${u.email.padEnd(25)} ${u.password}`);
