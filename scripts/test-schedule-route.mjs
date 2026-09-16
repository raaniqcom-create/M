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
ok('«أنوار حديثة» إلى حديثة (أملاها صاحبُ المنصّة) لا إلى «أنوار المدينة» في بغداد', () => {
  const c = roadCoords('أنوار حديثة', 'حديثة');
  assert.ok(c && Math.abs(c.lat - 34.12477) < 1e-4, JSON.stringify(c));
});
ok('«أنوار» وحدَها لا تذهب إلى بغداد', () => {
  const c = roadCoords('أنوار', null);
  assert.ok(!c || c.lat > 33.9, JSON.stringify(c));
});
ok('«مركز توزيع الفلوجة الفلوجة» يذهب إلى مركز الفلوجة لا الرمادي', () => {
  const m = matchLine('مركز توزيع الفلوجة الفلوجة', []);
  assert.equal(m.name, 'مركز توزيع الفلوجة');
  const c = roadCoords('مركز توزيع الفلوجة', 'الفلوجة');
  assert.ok(c && Math.abs(c.lng - 43.76111) < 1e-4, JSON.stringify(c));
});
ok('«الزاوية الرمادي» تجد «الزوية»', () => {
  const m = matchLine('الزاوية الرمادي', []);
  assert.ok(m.name.includes('الزاوية'), m.name);
  assert.ok(m.score >= 55);
});
ok('«جبل النور هيت» تُربط بالمسجّلة في المحمدي', () => {
  const m = matchLine('جبل النور هيت', [{ id: 'J', name: 'محطة جبل النور المشيدة', lat: 33.5256, lng: 42.8964, city: 'المحمدي' }]);
  assert.equal(m.stationId, 'J');
});
ok('«الحق الرمادي» (صفٌّ قديم بكلمة المدينة) يجد طريقه', () => {
  const c = roadCoords('الحق الرمادي', 'الرمادي');
  assert.ok(c && Math.abs(c.lat - 33.42113) < 1e-4);
});
ok('اسمٌ مجهول → لا رابط', () => {
  assert.equal(roadCoords('محطة لا وجود لها أبداً', 'الرمادي'), null);
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
ok('«أنوار حديثة حديثة» → محطة وقود أنوار حديثة (لا «أنوار المدينة» في بغداد)', () => {
  const m = matchLine('أنوار حديثة حديثة', []);
  assert.equal(m.name, 'محطة وقود أنوار حديثة');
  assert.equal(m.city, 'حديثة');
});
ok('«مركز توزيع الرمادي الرمادي» تُعرف الآن', () => {
  assert.equal(matchLine('مركز توزيع الرمادي الرمادي', []).name, 'مركز توزيع الرمادي');
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

// ── عناوينُ وأسماءٌ أملاها صاحبُ المنصّة لمحطاتٍ في المسح ──
import { shortAddress } from '../lib/scheduleRoute.ts';
import { ROAD_STATIONS } from '../lib/roadStations.ts';
assert.equal(shortAddress({ name: 'محطة الريم للوقود' }), '35 الرمادي');
assert.equal(shortAddress({ name: 'محطة تعبئة مها البادية' }), 'البو عيادة');
assert.equal(shortAddress({ name: 'محطة وقود الكورنيش' }), 'الجزيرة');
assert.equal(shortAddress({ name: 'محطة وقود أسوار المدينة' }), 'الشراع');
assert.ok(ROAD_STATIONS.some((s) => s.n === 'محطة وقود الكورنيش') && !ROAD_STATIONS.some((s) => s.n.startsWith('البوذياب')));
assert.equal(matchLine('الكورنيش الرمادي', []).name, 'محطة وقود الكورنيش');
console.log('  ✓ عناوينُ الريم ومها البادية والكورنيش وأسوار المدينة، واسمُ الكورنيش');
