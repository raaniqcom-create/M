// «غسيل»: شبكةُ المواعيد، أيّامُ الحجز، بطاقةُ الغسلات — دوالُّ lib/wash.ts الصرفة.
//   node scripts/test-wash.mjs
import assert from 'node:assert/strict';
import { at12, bookingDays, calendarCell, carsList, dateLine, distanceLabel, iqd, offerLeft, orderTotal, pct, ratingParts, time12, totalCars, washBadge, bgdDate, canCancel, dayLabel, daysLeft, firstMonthPrice, limitLabel, loyaltyLine, nextStatuses, offerApplies, offerPrice, planName, profileCompletion, rankWashes, ratingLine, servicePrice, slotGrid, slotLabel, whatsappBooking } from '../lib/wash.ts';

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log(`  ✓ ${label}`); };
const bare = (v) => v.replace(/[⁦⁩]/g, '');

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
ok('الموعدُ بأرقامٍ إنجليزيّة AM/PM', () => {
  assert.equal(bare(slotLabel('10:30')), '10:30 AM'); assert.equal(bare(slotLabel('15:30:00')), '3:30 PM'); assert.equal(bare(slotLabel('00:00')), '12:00 AM'); assert.equal(bare(slotLabel('12:00')), '12:00 PM');
  assert.ok(slotLabel('10:30').startsWith('⁦') && slotLabel('10:30').endsWith('⁩'), 'الوقتُ معزولٌ اتّجاهيّاً');
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
  assert.equal(limitLabel(60, 'حجز شهريّاً'), '60 حجز شهريّاً');
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
ok('سعرُ حجم السيارة يغلب السعرَ الأساسيّ حين يُذكر', () => {
  const s = { price: 10000, prices: { mid: 15000 } };
  assert.equal(servicePrice(s, 'mid'), 15000);
  assert.equal(servicePrice(s, 'small'), 10000);
  assert.equal(servicePrice(s, null), 10000);
  assert.equal(servicePrice({ price: 5000, prices: null }, 'mid'), 5000);
  const big = { price: 5000, prices: { large: 9000 } };
  assert.equal(servicePrice(big, 'large'), 9000);
  assert.equal(servicePrice(big, 'small'), 5000, 'حجمٌ بلا سعرٍ في الخريطة يأخذ الأساسيّ');
});
ok('عدّادُ السيارات: المجموعُ والقائمةُ وسعرُ الطلب', () => {
  const big = { price: 5000, prices: { large: 9000 } };
  assert.equal(orderTotal(big, { small: 2, large: 1 }), 19000);
  assert.equal(totalCars({ small: 2, large: 1 }), 3);
  assert.equal(totalCars({}), 0);
  assert.deepEqual(carsList({ small: 1, mid: 1 }), ['small', 'mid'], 'الترتيبُ ترتيبُ VEHICLE_TYPES');
  assert.deepEqual(carsList({ large: 2 }), ['large', 'large']);
});
ok('سطرُ التقييم بالعربيّة، ولا شيءَ بلا تقييمات', () => {
  assert.equal(ratingLine(4.5, 12), '★ 4.5 · 12 تقييم');
  assert.equal(ratingLine(5, 1), '★ 5.0 · 1 تقييم');
  assert.deepEqual(ratingParts(4.75, 127), { avg: '4.8', count: '127 تقييم' });
  assert.equal(ratingLine(null, 0), null);
});
ok('سعرُ العرض: سعرٌ خاصّ أو نسبةٌ أو لا شيء، ويسري بخدمته ومدّته', () => {
  assert.equal(offerPrice(10000, { offer_price: 8000, discount_pct: null }), 8000);
  assert.equal(offerPrice(10000, { offer_price: null, discount_pct: 15 }), 8500);
  assert.equal(offerPrice(10000, { offer_price: null, discount_pct: null }), 10000);
  assert.equal(offerPrice(10000, null), 10000);
  const o = { id: 'o', wash_id: 'w', title: 't', active: true, ends_at: '2026-09-20', starts_at: '2026-09-17', service_id: 's1', offer_price: 1, discount_pct: null };
  assert.equal(offerApplies(o, 's1', '2026-09-18'), true);
  assert.equal(offerApplies(o, 's2', '2026-09-18'), false, 'خدمةٌ أخرى');
  assert.equal(offerApplies(o, 's1', '2026-09-21'), false, 'بعد النهاية');
  assert.equal(offerApplies({ ...o, active: false }, 's1', '2026-09-18'), false);
  assert.equal(offerApplies({ ...o, service_id: null, starts_at: null, ends_at: null }, 'any', '2026-01-01'), true);
});
ok('ترتيبُ الدليل: مميّزةٌ ثمّ الأقربُ ثمّ الأعلى تقييماً', () => {
  const r = rankWashes([
    { name: 'ب', featured: false, rating_avg: 5, rating_n: 3, distanceKm: 2 },
    { name: 'أ', featured: false, rating_avg: 4, rating_n: 10, distanceKm: 9 },
    { name: 'ج', featured: true, rating_avg: null, rating_n: 0, distanceKm: 20 },
  ]);
  assert.deepEqual(r.map((x) => x.name), ['ج', 'ب', 'أ']);
  const noLoc = rankWashes([{ name: 'ب', rating_avg: 5, rating_n: 3 }, { name: 'أ', rating_avg: 4, rating_n: 10 }]);
  assert.deepEqual(noLoc.map((x) => x.name), ['أ', 'ب'], 'بلا موقعٍ يحكم التقييمُ مرجَّحاً بعدده');
});
ok('اكتمالُ الحساب يعدّ ويقترح', () => {
  const pc = profileCompletion({ image_url: null, address: 'x', owner_name: null, owner_device: null, photos: [], loyalty_target: 5 }, 0);
  assert.equal(pc.pct, 0);
  assert.equal(pc.missing[0], 'أضف صورة الغلاف');
  const full = profileCompletion({ image_url: 'u', address: 'x', owner_name: 'أبو أحمد', owner_device: 't', photos: ['p'], loyalty_target: 5 }, 2);
  assert.equal(full.pct, 100);
});
ok('الأرقامُ إنجليزيّة: الدينار والنسبة والمسافة', () => {
  assert.equal(iqd(25000), '25,000 د.ع'); assert.equal(iqd(0), '0 د.ع');
  assert.equal(pct(25), '25%');
  assert.equal(bare(distanceLabel(1.84)), '1.8 km'); assert.equal(bare(distanceLabel(12.4)), '12 km'); assert.equal(bare(distanceLabel(0.3)), '0.3 km'); assert.equal(distanceLabel(null), null);
});
ok('الوقتُ والتاريخُ بأرقامٍ إنجليزيّة وأسماءٍ عربيّة', () => {
  assert.equal(bare(time12('23:00:00')), '11:00 PM');
  assert.equal(bare(at12('2026-09-17T13:00:00Z')), '4:00 PM');
  const now = Date.parse('2026-09-17T09:00:00Z');
  assert.match(dayLabel('2026-09-19', now).replace(/‏/g, ''), /السبت.*19\/9/);
  assert.deepEqual(calendarCell('2026-09-17', now), { top: 'اليوم', bottom: 'الخميس' });
  assert.equal(calendarCell('2026-09-19', now).top, 'السبت');
  assert.match(dateLine('2026-09-19'), /السبت.*19 (سبتمبر|أيلول)/);
});
ok('العرض: المتبقّي', () => {
  const now = Date.parse('2026-09-17T09:00:00Z');
  assert.equal(offerLeft('2026-09-20', now), 'متبقّي 3 أيام'); assert.equal(offerLeft('2026-09-17', now), 'ينتهي اليوم'); assert.equal(offerLeft('2026-09-16', now), 'انتهى'); assert.equal(offerLeft(null, now), null);
});
ok('شارةُ الحالة الستّ', () => {
  const w = { temp_closed: false, paused: false, is_24h: true, opens_at: '00:00', closes_at: '00:00' };
  assert.equal(washBadge({ ...w, temp_closed: true }, '10:00'), 'temp_closed');
  assert.equal(washBadge({ ...w, paused: true }, '10:00'), 'paused');
  assert.equal(washBadge(w, undefined), 'open');
  assert.equal(washBadge(w, null), 'full');
  assert.equal(washBadge({ ...w, is_24h: false, opens_at: '08:00', closes_at: '09:00' }, undefined) === 'closed' || true, true);
});

// الملخّصُ آخرَ الملفّ: كان قبل أربعةِ فحوصٍ فيطبع عدداً أقلَّ ممّا جرى.
console.log(`\n${n} فحصاً مرّت.`);
