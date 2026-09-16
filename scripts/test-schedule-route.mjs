// «الطريق لها» لصفّ الجدول: إحداثيّاتُ المنصّة أوّلاً، ثمّ مساعدُ الطريق في الأنبار وحدَه.
//   node scripts/test-schedule-route.mjs
import assert from 'node:assert/strict';
import { roadCoords, routeFor, wazeUrl, isAnbarCity } from '../lib/scheduleRoute.ts';
import { matchLine, readManualLine } from '../lib/schedule.ts';

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log(`  ✓ ${label}`); };

ok('صفُّ منصّةٍ بإحداثيّاته لا يُبحث عنه', () => {
  assert.deepEqual(routeFor({ name: 'أيّ اسم', city: null, lat: 33.4, lng: 43.3 }), { lat: 33.4, lng: 43.3 });
});
ok('«محطة الحق» من مساعد الطريق', () => {
  const c = roadCoords('محطة الحق', 'الرمادي');
  assert.ok(c && Math.abs(c.lat - 33.42113) < 1e-4, JSON.stringify(c));
});
ok('«أنوار حديثة» لا تذهب إلى بغداد', () => {
  assert.equal(roadCoords('أنوار حديثة', 'حديثة'), null);
});
ok('«الحق الرمادي» (صفٌّ قديم بكلمة المدينة) يجد طريقه', () => {
  const c = roadCoords('الحق الرمادي', 'الرمادي');
  assert.ok(c && Math.abs(c.lat - 33.42113) < 1e-4);
});
ok('اسمٌ مجهول → لا رابط', () => {
  assert.equal(roadCoords('مركز توزيع الرمادي', 'الرمادي'), null);
});
ok('ويز بالإحداثيّات', () => {
  assert.equal(wazeUrl(33.4, 43.3), 'https://waze.com/ul?ll=33.4,43.3&navigate=yes');
});
ok('بغداد ليست أنبار', () => {
  assert.ok(isAnbarCity('الرمادي') && !isAnbarCity('بغداد'));
});

console.log('المطابقةُ مع كلمة المدينة الملتصقة:');
for (const [raw, needle, city] of [
  ['الحق الرمادي', 'محطة الحق', 'الرمادي'],
  ['الكوثر الخالدية', 'الكوثر', 'الخالدية'],
  ['التقى عامرية الفلوجة', 'التقى', 'عامرية الفلوجة'],
  ['الدمام الخالدية', 'الدمام', 'الخالدية'],
  ['السعد الفلوجة', 'السعد', 'الفلوجة'],
]) {
  ok(`«${raw}» → ${needle} · ${city}`, () => {
    const m = matchLine(raw, []);
    assert.ok(m.name.includes(needle), `صارت «${m.name}»`);
    assert.ok(m.score >= 55, `درجة ${m.score}`);
    assert.equal(m.city, city);
  });
}
ok('«أنوار حديثة حديثة» تبقى كما وصلت', () => {
  const m = matchLine('أنوار حديثة حديثة', []);
  assert.ok(m.score < 55, `طابقت «${m.name}» بـ${m.score}`);
});
ok('«مركز توزيع الرمادي الرمادي» تبقى كما وصلت', () => {
  assert.ok(matchLine('مركز توزيع الرمادي الرمادي', []).score < 55);
});
ok('«الحق الرمادي | بنزين عادي» بالفواصل: المدينةُ تُنزع من الاسم', () => {
  const l = readManualLine('الحق الرمادي | بنزين عادي');
  assert.equal(l.name, 'الحق');
  assert.equal(l.city, 'الرمادي');
  assert.equal(l.product, 'gasoline_regular');
});
ok('«محطة الخالدية - بنزين» لا تُفرَّغ من اسمها', () => {
  const l = readManualLine('محطة الخالدية - بنزين عادي');
  assert.equal(l.name, 'محطة الخالدية');
});
console.log(`\n${n} فحصاً مرّت.`);
