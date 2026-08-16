// Why does the admin panel say "تعذّر فحص النظام"?
//
// The client swallows the HTTP status (`.catch(() => null)`), so every cause —
// not deployed, wrong role, a check that throws — printed the same sentence.
// This asks the real questions one at a time.
//
//   node scripts/diag-admin.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const svc = { apikey: SRV, Authorization: `Bearer ${SRV}` };

const j = async (path, init) => {
  const r = await fetch(`${URL_}${path}`, init);
  const t = await r.text();
  try {
    return { status: r.status, body: JSON.parse(t) };
  } catch {
    return { status: r.status, body: t.slice(0, 400) };
  }
};

console.log('=== الحسابات في profiles ===');
const p = await j('/rest/v1/profiles?select=id,phone,role,full_name', { headers: svc });
console.log(p.status, JSON.stringify(p.body, null, 1));

console.log('\n=== auth.users ===');
const u = await j('/auth/v1/admin/users?per_page=100', { headers: svc });
const users = u.body?.users ?? [];
console.log(u.status, 'عدد:', users.length);
for (const x of users) {
  console.log(
    ' ',
    x.phone || '-',
    '|',
    x.email || '-',
    '|',
    x.id.slice(0, 8),
    '|',
    x.phone_confirmed_at || x.email_confirmed_at ? 'مؤكَّد' : 'غير مؤكَّد'
  );
}

console.log('\n=== المحطات ===');
const s = await j('/rest/v1/stations?select=id,name,city,status,owner_id,slug', { headers: svc });
console.log(s.status, JSON.stringify(s.body, null, 1));
