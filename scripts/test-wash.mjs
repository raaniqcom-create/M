// «غسيل»: شبكةُ المواعيد، أيّامُ الحجز، بطاقةُ الغسلات — دوالُّ lib/wash.ts الصرفة.
//   node scripts/test-wash.mjs
import assert from 'node:assert/strict';
import { bookingDays, bgdDate, canCancel, dayLabel, daysLeft, firstMonthPrice, limitLabel, loyaltyLine, nextStatuses, planName, servicePrice, slotGrid, slotLabel, whatsappBooking } from '../lib/wash.ts';

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log(`  ✓ ${label}`); };

ok('دوامٌ عاديّ 08:00→20:00 كلَّ ٣٠ دقيقة = ٢٤ موعداً', () => {
  const g = slotGrid({ is_24h: false, opens_at: '08:00:00', closes_at: '20:00:00', slot_minutes: 30 });
  assert.equal(g.length, 24); assert.equal(g[0], '08:00'); assert.equal(g.at(-1), '19:30');
});
ok('دوامٌ يعبر منتصفَ الليل 18:00→02:00', () => {
  const g = slotGrid({ is_24h: false, opens_at: '18:00:00', closes_at: '02:00:00', slot_minutes: 60 });
  assert.ok(g.includes('23:00') && g.includes('01:00') && !g.includes('12:00'));
  assert.equal(g.length, 8);
});
ok('٢٤ ساعة كلَّ ساعة = ٢٤', () => {
  assert.equal(slotGrid({ is_24h: true, opens_at: '00:00', closes_at: '00:00', slot_minutes: 60 }).length, 24);
});
ok('الحدُّ الأدنى يقصّ الماضي', () => {
  const g = slotGrid({ is_24h: false, opens_at: '08:00', closes_at: '20:00', slot_minutes: 30 }, 10 * 60 + 10);
  assert.equal(g[0], '10:30');
});
ok('أيّامُ الحجز: الضيفُ يومان مفتوحان من أربعة، والمشتركُ أربعة', () => {
  const now = Date.parse('2026-09-17T09:00:00Z');
  const g = bookingDays(false, now); const s = bookingDays(true, now);
  assert.equal(g.length, 4); assert.deepEqual(g.map((d) => d.locked), [false, false, true, true]);
  assert.deepEqual(s.map((d) => d.locked), [false, false, false, false]);
  assert.equal(g[0].day, '2026-09-17'); assert.equal(g[3].day, '2026-09-20');
});
ok('نهايةُ الشهر تنقلب', () => {
  assert.equal(bgdDate(1, Date.parse('2026-09-30T20:00:00Z')), '2026-10-01');
});
ok('اليوم/غداً', () => {
  const now = Date.parse('2026-09-17T09:00:00Z');
  assert.equal(dayLabel('2026-09-17', now), 'اليوم'); assert.equal(dayLabel('2026-09-18', now), 'غداً');
});
ok('بطاقةُ الغسلات', () => {
  assert.equal(loyaltyLine(3, 5, 0), '3 من 5 — بعد غسلتين واحدةٌ مجّانيّة');
  assert.match(loyaltyLine(0, 5, 1), /غسلةٌ مجّانيّة/);
  assert.equal(loyaltyLine(0, 0, 0), null);
});
ok('الموعدُ يُقرأ بالعربيّة', () => {
  assert.equal(slotLabel('10:30'), '10:30 صباحاً');
});
ok('رابطُ واتساب بالرمز', () => {
  const u = whatsappBooking('07901234567', { code: '482113', name: 'أحمد', service_name: 'غسيل خارجي', starts_at: '2026-09-17T07:30:00Z', car: null });
  assert.ok(u.startsWith('https://wa.me/9647901234567?text=') && u.includes(encodeURIComponent('482113')));
});
ok('أيّامُ الحجز تتبع حدودَ الإدارة لا الثوابت', () => {
  const d = bookingDays(false, Date.now(), { guest: 2, subscriber: 5 });
  assert.equal(d.length, 6);
  assert.deepEqual(d.map((x) => x.locked), [false, false, false, true, true, true]);
});
ok('سعرُ أوّل شهر: عرضُ الإطلاق لمن لم يدفع قبلُ، وإلّا سعرُ الباقة', () => {
  const plan = { code: 'basic', name: 'الأساسيّة', price_iqd: 40000, features: {} };
  assert.equal(firstMonthPrice(plan, 20000, false), 20000);
  assert.equal(firstMonthPrice(plan, 20000, true), 40000);
  assert.equal(firstMonthPrice(plan, 0, false), 40000);
  assert.equal(firstMonthPrice(plan, 50000, false), 40000, 'عرضٌ أغلى من الباقة يُهمَل');
});
ok('الأيّامُ المتبقّية وأسماءُ الباقات والحدود', () => {
  const now = Date.parse('2026-09-16T12:00:00+03:00');
  assert.equal(daysLeft('2026-09-26', now), 10);
  assert.equal(daysLeft('2026-09-14', now), -2);
  assert.equal(daysLeft(null, now), null);
  const cfg = { plans: [{ code: 'pro', name: 'الاحترافيّة', price_iqd: 60000, features: {} }] };
  assert.equal(planName(cfg, 'pro'), 'الاحترافيّة');
  assert.equal(planName(cfg, 'free'), 'مجّانيّة');
  assert.equal(planName(null, 'x'), 'x');
  assert.equal(limitLabel(0, 'حجز'), 'بلا حدّ');
  assert.equal(limitLabel(60, 'حجز شهريّاً'), '٦٠ حجز شهريّاً');
});
ok('انتقالاتُ الحالة كما تسمح القاعدة', () => {
  assert.deepEqual(nextStatuses('pending'), ['confirmed', 'cancelled_by_business']);
  assert.deepEqual(nextStatuses('in_service'), ['completed']);
  assert.deepEqual(nextStatuses('completed'), []);
  assert.deepEqual(nextStatuses('expired'), []);
});
ok('الإلغاءُ مجّانيٌّ قبل نصف ساعة، ومتأخّرٌ بعدها، وممنوعٌ بعد الموعد', () => {
  const now = Date.parse('2026-09-17T10:00:00+03:00');
  assert.equal(canCancel('2026-09-17T11:00:00+03:00', now), 'free');
  assert.equal(canCancel('2026-09-17T10:20:00+03:00', now), 'late');
  assert.equal(canCancel('2026-09-17T09:59:00+03:00', now), 'no');
});
ok('سعرُ نوع السيارة يغلب السعرَ الأساسيّ حين يُذكر', () => {
  const s = { price: 10000, prices: { suv: 15000 } };
  assert.equal(servicePrice(s, 'suv'), 15000);
  assert.equal(servicePrice(s, 'sedan'), 10000);
  assert.equal(servicePrice(s, null), 10000);
  assert.equal(servicePrice({ price: 5000, prices: null }, 'suv'), 5000);
});
console.log(`\n${n} فحصاً مرّت.`);
