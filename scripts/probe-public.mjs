// Every read the public home page performs, from a visitor's position.
//
// The list spun forever with no error on screen, which means one of these
// either fails or never settles — and the page has no state for "the read
// came back broken", only "not loaded yet".
//
//   node scripts/probe-public.mjs
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

const READS = [
  ['stations', '/rest/v1/stations?select=*&status=eq.approved&is_demo=eq.false&order=name.asc'],
  ['stations (no is_demo)', '/rest/v1/stations?select=*&status=eq.approved&order=name.asc'],
  ['station_products', '/rest/v1/station_products?select=*'],
  ['station_traffic_avg', '/rest/v1/station_traffic_avg?select=*'],
  ['station_product_traffic', '/rest/v1/station_product_traffic?select=*'],
  ['ads', '/rest/v1/ads?select=*'],
  ['site_stats', '/rest/v1/site_stats?select=*'],
  ['station_reviews', '/rest/v1/station_reviews?select=*&status=eq.approved'],
  ['traffic_votes', '/rest/v1/traffic_votes?select=*&limit=1'],
];

let bad = 0;
for (const [name, path] of READS) {
  const t0 = Date.now();
  try {
    const r = await fetch(URL_ + path, { headers: H, signal: AbortSignal.timeout(12000) });
    const body = await r.text();
    const ms = Date.now() - t0;
    const ok = r.status === 200;
    if (!ok) bad++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(24)} ${String(r.status).padEnd(4)} ${String(ms + 'ms').padEnd(7)} ${ok ? body.slice(0, 40) : body.slice(0, 150)}`
    );
  } catch (e) {
    bad++;
    console.log(`FAIL  ${name.padEnd(24)} ---  ${Date.now() - t0}ms  ${e.name}: ${e.message}`);
  }
}

// the visit counter the header shows
try {
  const r = await fetch(URL_ + '/rest/v1/rpc/increment_visits', { method: 'POST', headers: H, body: '{}' });
  console.log(`${r.status === 200 ? 'ok  ' : 'FAIL'}  ${'rpc/increment_visits'.padEnd(24)} ${r.status}`);
  if (r.status !== 200) bad++;
} catch (e) {
  bad++;
  console.log('FAIL  rpc/increment_visits      ' + e.message);
}

console.log(bad ? `\n${bad} فشل` : '\nكل القراءات العامة سليمة');
process.exit(bad ? 1 : 0);
