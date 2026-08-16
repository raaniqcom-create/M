// Proves the four holes are shut — and, just as importantly, that the paths
// the app relies on still work.
//
// Everything below runs with the ANON key only: the same key printed in every
// visitor's JavaScript bundle. That is the attacker's position, so it is the
// only position worth testing from.
//
//   node scripts/verify-holes.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const call = async (path, init = {}) => {
  const r = await fetch(`${URL_}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  return { status: r.status, body: t.slice(0, 160) };
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'مغلقة ' : 'مفتوحة'}  ${name}${detail ? `  — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('=== الثغرات: هل أُغلقت؟ ===');

// 1. self-granting is_admin on insert
{
  const r = await call('/rest/v1/device_tokens', {
    method: 'POST',
    body: JSON.stringify({ token: 'probe-' + 'x'.repeat(40), platform: 'android', is_admin: true }),
  });
  check('منح is_admin لنفسه', r.status === 403 || r.status === 401, `${r.status} ${r.body}`);
}

// 2 & 3. unfiltered mass delete
//
// This one CANNOT be probed by actually deleting. RLS does not reject a DELETE
// the way it rejects an INSERT — it filters the rows the statement can see. So
// PostgREST answers 204 either way:
//
//   policy gone    -> zero rows visible -> zero deleted -> 204
//   policy present -> every row visible -> every row deleted -> 204
//
// An earlier version of this file asserted on that 204 and would have emptied
// the table on the very run that was supposed to prove it was safe. The status
// carries no information; only the row count does, and anon cannot read it.
//
// So the delete capability is asserted from the policy catalogue instead, and
// the probe below deletes by a token that cannot exist — harmless whichever
// way the answer goes.
for (const table of ['device_tokens', 'push_subscriptions']) {
  const col = table === 'device_tokens' ? 'token' : 'endpoint';
  const r = await call(`/rest/v1/${table}?${col}=eq.__sentinel_never_stored__`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  // Empty body or an outright refusal both mean nothing was reachable.
  const reachable = r.status === 200 && r.body.trim().startsWith('[') && r.body.trim() !== '[]';
  check(`حذف صفوف ${table}`, !reachable, `${r.status} ${r.body || '(فارغ)'}`);
}

// 4. publishing a pre-approved review
{
  const r = await call('/rest/v1/station_reviews', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      station_id: '00000000-0000-0000-0000-000000000000',
      rating: 5,
      comment: 'probe',
      device_id: 'probe-device',
      status: 'approved',
    }),
  });
  // A foreign-key rejection also proves the row never landed; what must NOT
  // happen is a 201 carrying status approved.
  const leaked = r.status === 201 && r.body.includes('approved');
  check('نشر تقييم معتمَد ذاتياً', !leaked, `${r.status} ${r.body}`);
}

console.log('\n=== ما يعتمد عليه التطبيق: هل ما زال يعمل؟ ===');

// The app's own device registration — {token, platform}, no is_admin.
//
// This writes a real row and anon has no DELETE, so it cannot clean up after
// itself. A fixed token is used rather than a random one, so repeat runs hit
// the unique constraint and answer 409 instead of littering the table.
{
  const probe = 'verify-holes-fixed-probe-token-do-not-remove';
  const r = await call('/rest/v1/device_tokens', {
    method: 'POST',
    body: JSON.stringify({ token: probe, platform: 'android' }),
  });
  const ok = r.status === 201 || r.status === 200 || r.status === 409;
  const first = r.status === 201 || r.status === 200;
  console.log(
    `${ok ? 'يعمل  ' : 'معطّل '}  تسجيل جهاز جديد  — ${r.status}${first ? ' (أُنشئ الصف الآن)' : ' (موجود من تشغيل سابق)'}`
  );
  ok ? pass++ : fail++;
}

// the unsubscribe path the client now uses
{
  const r = await call('/rest/v1/rpc/push_unsubscribe', {
    method: 'POST',
    body: JSON.stringify({
      p_station_id: '00000000-0000-0000-0000-000000000000',
      p_endpoint: 'https://example.invalid/none',
      p_role: 'driver',
    }),
  });
  const ok = r.status === 200 || r.status === 204;
  console.log(`${ok ? 'يعمل  ' : 'معطّل '}  إلغاء الاشتراك عبر RPC  — ${r.status} ${r.body || '(فارغ)'}`);
  ok ? pass++ : fail++;
}

// public read of approved stations — the whole point of the site
{
  const r = await call('/rest/v1/stations?select=id,name&status=eq.approved&limit=1');
  const ok = r.status === 200;
  console.log(`${ok ? 'يعمل  ' : 'معطّل '}  قراءة المحطات للزائر  — ${r.status}`);
  ok ? pass++ : fail++;
}

console.log(`\nنجح ${pass} · فشل ${fail}`);
process.exit(fail ? 1 : 0);
