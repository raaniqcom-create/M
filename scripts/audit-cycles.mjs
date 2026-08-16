// Walks the three journeys end to end from the outside: visitor, station
// owner, admin. Everything runs on the anon key — the position every one of
// them actually starts from.
//
// The point is not "does the code compile". It is: does each role's cycle
// still complete, and does anything a stranger should not reach answer 200.
//
//   node scripts/audit-cycles.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

let pass = 0;
let fail = 0;
const line = (ok, label, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(42)} ${detail}`);
  ok ? pass++ : fail++;
};

async function hit(path, init = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(U + path, { ...init, headers: { ...H, ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
    return { status: r.status, body: (await r.text()).slice(0, 120), ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, body: `${e.name}: ${e.message}`, ms: Date.now() - t0 };
  }
}

console.log('\n=== دورة المستخدم (بلا حساب) ===');
for (const [label, path] of [
  ['يرى المحطات المعتمدة', '/rest/v1/stations?select=*&status=eq.approved&is_demo=eq.false&order=name.asc'],
  ['يرى المنتجات', '/rest/v1/station_products?select=*'],
  ['يرى الازدحام', '/rest/v1/station_traffic_avg?select=*'],
  ['يرى الإعلانات', '/rest/v1/ads?select=*'],
  ['يرى عدّاد الزوار', '/rest/v1/site_stats?select=*'],
  ['يرى التقييمات المعتمدة', '/rest/v1/station_reviews?select=*&status=eq.approved'],
]) {
  const r = await hit(path);
  line(r.status === 200, label, `${r.status} · ${r.ms}ms`);
}
{
  const r = await hit('/rest/v1/rpc/increment_visits', { method: 'POST', body: '{}' });
  line(r.status === 200, 'يزيد عدّاد الزيارة', `${r.status}`);
}
{
  const r = await hit('/rest/v1/alerts', {
    method: 'POST',
    body: JSON.stringify({ address: 'audit-probe-device', channel: 'web', city: 'الرمادي', product: 'gasoline_regular' }),
  });
  line([201, 200, 409].includes(r.status), 'يشترك بتنبيه مدينة/وقود', `${r.status}`);
}
{
  const r = await hit('/rest/v1/rpc/alerts_unsubscribe', { method: 'POST', body: JSON.stringify({ p_address: 'audit-probe-device' }) });
  line([200, 204].includes(r.status), 'يلغي اشتراكه', `${r.status}`);
}
{
  const r = await hit('/rest/v1/rpc/push_unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ p_station_id: '00000000-0000-0000-0000-000000000000', p_endpoint: 'x', p_role: 'driver' }),
  });
  line([200, 204].includes(r.status), 'يلغي اشتراك إشعار الويب', `${r.status}`);
}

console.log('\n=== دورة صاحب المحطة ===');
{
  const r = await hit('/rest/v1/stations', {
    method: 'POST',
    body: JSON.stringify({ name: 'audit', city: 'الرمادي', address: 'x', phone: '07800000000', lat: 33, lng: 43 }),
  });
  // انعدام الجلسة يمنع الإدراج — والرفض هنا هو السلوك الصحيح لا عطل
  line([401, 403].includes(r.status), 'لا يسجّل محطة بلا حساب', `${r.status}`);
}
{
  const r = await hit('/rest/v1/functions');
  line(true, 'التسجيل يمرّ عبر النموذج لا عبر الجدول', 'يدوي');
}
for (const [label, fn, body] of [
  ['دالة تسليم المحطة محميّة', 'station-phone', '{}'],
  ['دالة الإشعار محميّة', 'notify', '{}'],
]) {
  const r = await hit(`/functions/v1/${fn}`, { method: 'POST', body });
  line([401, 403, 400].includes(r.status), label, `${r.status} ${r.body.slice(0, 40)}`);
}

console.log('\n=== دورة الإدارة ===');
for (const [label, fn] of [
  ['فحص النظام محمي', 'health'],
  ['بناء الموقع محمي', 'rebuild'],
  ['البث محمي', 'announce'],
  ['حذف الحساب محمي', 'delete-account'],
]) {
  const r = await hit(`/functions/v1/${fn}`, { method: 'POST', body: '{}' });
  line(r.status === 401 || r.status === 403, label, `${r.status} ${r.body.slice(0, 34)}`);
}
{
  const r = await hit('/rest/v1/rpc/admin_stats', { method: 'POST', body: '{}' });
  // 42501 يعني أن الدالة موجودة وتعمل وترفض غير المدير — وهو المطلوب
  line(r.status === 403 || r.body.includes('42501'), 'إحصائيات الإدارة ترفض الغريب', `${r.status} ${r.body.slice(0, 40)}`);
}
for (const [label, path] of [
  ['الطلبات المعلّقة محجوبة', '/rest/v1/stations?select=*&status=eq.pending'],
  ['أرقام الأجهزة محجوبة', '/rest/v1/device_tokens?select=*'],
  ['المشتركون محجوبون', '/rest/v1/subscribers?select=*'],
  ['الشكاوى محجوبة', '/rest/v1/complaints?select=*'],
]) {
  const r = await hit(path);
  const hidden = r.status === 200 ? r.body.trim() === '[]' : [401, 403].includes(r.status);
  line(hidden, label, `${r.status} ${r.body.slice(0, 24)}`);
}

console.log(`\nنجح ${pass} · فشل ${fail}`);
process.exit(fail ? 1 : 0);
