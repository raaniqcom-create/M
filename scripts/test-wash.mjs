// «غسيل»: شبكةُ المواعيد، أيّامُ الحجز، بطاقةُ الغسلات — دوالُّ lib/wash.ts الصرفة.
//   node scripts/test-wash.mjs
import assert from 'node:assert/strict';
import { bookingDays, bgdDate, dayLabel, loyaltyLine, slotGrid, slotLabel, whatsappBooking } from '../lib/wash.ts';

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
console.log(`\n${n} فحصاً مرّت.`);
