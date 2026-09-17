// سلسلةُ الصباح: ترتيبُ المدن والوقود، أولويّةُ المسجّلة النشطة، والرجوعُ إلى الأكثر منتجات.
//   node scripts/test-morning-series.mjs
import assert from 'node:assert/strict';
import {
  buildMorningSeries,
  displayName,
  qualifies,
  seriesKey,
  SERIES_PRODUCT_ORDER,
  TITLE_MAX,
  BODY_MAX,
} from '../lib/morningSeries.ts';

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log(`  ✓ ${label}`); };
const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const DAY = '2026-09-17';

const station = (id, name, city, o = {}) => ({
  id, name, city, address: o.address ?? null, status: o.status ?? 'approved', is_demo: o.is_demo ?? false,
  is_24h: true, opens_at: '00:00:00', closes_at: '23:59:00', temp_closed: false,
  products: o.products ?? [{ product: 'gasoline_premium', is_available: false, updated_at: ago(o.age ?? 2), runs_out_at: null }],
  updates24h: o.updates ?? 1,
});
const row = (product, station_name, city, linked_station_id = null) => ({ product, station_name, city, linked_station_id });

/** محطةٌ تُعلن هذه المنتجاتِ **الآن** على لوحتها — `isOffered` تصدّقها.
 *  ولا يُختبر الإغلاقُ بالدوام: `isOffered` تقرأ الساعةَ الحقيقيّة، فيتبدّل
 *  الفحصُ بساعة تشغيله. الإغلاقُ يُختبر بـ`temp_closed` وحدَه. */
const liveStation = (id, name, city, products, o = {}) =>
  station(id, name, city, {
    ...o,
    products: products.map((p) => ({ product: p, is_available: true, updated_at: ago(1), runs_out_at: null })),
  });

ok('ترتيبُ الوقود: المحسن ثمّ العادي ثمّ الكاز ثمّ الباقي', () => {
  assert.deepEqual(SERIES_PRODUCT_ORDER.slice(0, 3), ['gasoline_premium', 'gasoline_regular', 'kerosene']);
  assert.ok(SERIES_PRODUCT_ORDER.includes('gasoline_super') && SERIES_PRODUCT_ORDER.includes('white_oil'));
});

ok('مدينةٌ فيها مسجّلةٌ نشطة: إشعارٌ لكلّ وقودٍ باسمها، والمدنُ بالجمهور تنازليّاً', () => {
  const rows = [
    row('kerosene', 'محطة أخرى', 'هيت'),
    row('gasoline_regular', 'محطة الحق', 'الرمادي', 's1'),
    row('gasoline_premium', 'محطة الحق', 'الرمادي', 's1'),
    row('kerosene', 'محطة بعيدة', 'الرمادي'),
  ];
  const out = buildMorningSeries({ forDate: DAY, rows, stations: [station('s1', 'محطة الحق', 'الرمادي', { address: 'شارع 60' })], watchers: { 'الرمادي': 100, 'هيت': 10 } });
  assert.deepEqual(out.map((i) => `${i.city}:${i.product}`), ['الرمادي:gasoline_premium', 'الرمادي:gasoline_regular', 'الرمادي:kerosene', 'هيت:null']);
  assert.equal(out[0].stationId, 's1');
  assert.equal(out[0].registered, true);
  assert.equal(out[0].url, '/station/s1');
  assert.equal(out[0].title, 'بانزين محسن اليوم في الرمادي');
  assert.match(out[0].body, /^محطة الحق \(شارع 60\) — في جدول التوزيع اليوم/);
  // الكاز ليس عند المسجّلة: يُذكر غيرُ المسجّلة الذي عنده الكاز
  assert.equal(out[2].stationName, 'محطة بعيدة');
  assert.equal(out[2].registered, false);
  assert.match(out[2].url, /^\/place\/\?n=/);
});

ok('مدينةٌ بلا مسجّلة: إشعارٌ واحدٌ بالمحطة الأكثر منتجات، product=null، والمنتجاتُ بالترتيب', () => {
  const rows = [
    row('kerosene', 'محطة أ', 'حديثة'),
    row('gasoline_regular', 'محطة ب', 'حديثة'),
    row('gasoline_premium', 'محطة ب', 'حديثة'),
  ];
  const [it] = buildMorningSeries({ forDate: DAY, rows, stations: [], watchers: {} });
  assert.equal(it.product, null);
  assert.equal(it.stationName, 'محطة ب');
  assert.deepEqual(it.products, ['gasoline_premium', 'gasoline_regular']);
  assert.equal(it.title, 'بانزين محسن وبانزين عادي اليوم في حديثة');
  assert.match(it.body, /محطة ب — بانزين محسن وبانزين عادي في جدول التوزيع اليوم/);
  assert.equal(it.url, '/place/?n=%D9%85%D8%AD%D8%B7%D8%A9+%D8%A8&c=%D8%AD%D8%AF%D9%8A%D8%AB%D8%A9');
  assert.equal(it.key, `series:${DAY}:حديثة:all`);
});

ok('المسجّلةُ النشطة تسبق غيرَ المسجّلة الأكثرَ منتجات', () => {
  const rows = [
    row('gasoline_premium', 'محطة كبيرة', 'الفلوجة'),
    row('gasoline_regular', 'محطة كبيرة', 'الفلوجة'),
    row('kerosene', 'محطة كبيرة', 'الفلوجة'),
    row('gasoline_premium', 'محطة صغيرة', 'الفلوجة', 's2'),
  ];
  const out = buildMorningSeries({ forDate: DAY, rows, stations: [station('s2', 'محطة صغيرة', 'الفلوجة')], watchers: {} });
  assert.equal(out[0].product, 'gasoline_premium');
  assert.equal(out[0].stationName, 'محطة صغيرة');
  assert.equal(out.length, 3);
});

ok('الأنشطُ يُختار: عددُ التحديثات ثمّ أحدثُ تحديث', () => {
  const rows = [row('gasoline_premium', 'أ', 'الرمادي', 'a'), row('gasoline_premium', 'ب', 'الرمادي', 'b'), row('gasoline_premium', 'ج', 'الرمادي', 'c')];
  const st = [station('a', 'أ', 'الرمادي', { updates: 2, age: 1 }), station('b', 'ب', 'الرمادي', { updates: 5, age: 10 }), station('c', 'ج', 'الرمادي', { updates: 5, age: 3 })];
  const [it] = buildMorningSeries({ forDate: DAY, rows, stations: st, watchers: {} });
  assert.equal(it.stationId, 'c');
});

ok('التجريبيّة وغيرُ المعتمدة والقديمةُ (>٢٤ س) لا تتأهّل — فتُعامَل المدينةُ كأنّها بلا مسجّلة', () => {
  assert.equal(qualifies(station('x', 'x', 'c', { is_demo: true })), false);
  assert.equal(qualifies(station('x', 'x', 'c', { status: 'pending' })), false);
  assert.equal(qualifies(station('x', 'x', 'c', { age: 30 })), false);
  assert.equal(qualifies(station('x', 'x', 'c', { age: 23 })), true);
  const rows = [row('gasoline_premium', 'محطة قديمة', 'الرمادي', 'old'), row('kerosene', 'محطة قديمة', 'الرمادي', 'old')];
  const [it] = buildMorningSeries({ forDate: DAY, rows, stations: [station('old', 'محطة قديمة', 'الرمادي', { age: 30 })], watchers: {} });
  assert.equal(it.product, null);
  assert.equal(it.registered, false);
  assert.equal(it.url, '/station/old', 'المربوطةُ القديمة تحتفظ بصفحتها');
});

ok('«متوفر الآن» حين يكون المنتجُ معروضاً فعلاً (isOffered)، لا لمجرّد أنّه في الجدول', () => {
  const rows = [row('gasoline_premium', 'محطة الحق', 'الرمادي', 's1')];
  const live = station('s1', 'محطة الحق', 'الرمادي', { products: [{ product: 'gasoline_premium', is_available: true, updated_at: ago(1), runs_out_at: null }] });
  const [a] = buildMorningSeries({ forDate: DAY, rows, stations: [live], watchers: {} });
  assert.equal(a.offeredNow, true);
  assert.equal(a.title, 'بانزين محسن متوفر الآن في الرمادي');
  const ranOut = station('s1', 'محطة الحق', 'الرمادي', { products: [{ product: 'gasoline_premium', is_available: true, updated_at: ago(1), runs_out_at: ago(0.5) }] });
  const [b] = buildMorningSeries({ forDate: DAY, rows, stations: [ranOut], watchers: {} });
  assert.equal(b.offeredNow, false);
  assert.equal(b.title, 'بانزين محسن اليوم في الرمادي');
});

ok('صفوفٌ بلا مدينة تُسقط، والاسمُ الطويل يُختصر', () => {
  const out = buildMorningSeries({ forDate: DAY, rows: [row('kerosene', 'x', null)], stations: [], watchers: {} });
  assert.equal(out.length, 0);
  assert.equal(displayName('محطة تعبئة وقود الرمادي الجديدة'), 'محطة الرمادي الجديدة');
  assert.equal(displayName('محطة تعبئة طليحة'), 'محطة طليحة');
  assert.equal(displayName('محطة الحق'), 'محطة الحق');
});

ok('الأطوالُ ضمن ٦٤/١٧٨ ولو كثرت المنتجاتُ وطال الاسم', () => {
  const name = 'محطة تعبئة وقود الأنبار الحديثة للمنتوجات النفطية الرئيسية';
  const rows = ['gasoline_premium', 'gasoline_regular', 'gasoline_super', 'kerosene', 'white_oil'].map((p) => row(p, name, 'عامرية الفلوجة'));
  const [it] = buildMorningSeries({ forDate: DAY, rows, stations: [], watchers: {} });
  assert.ok(it.title.length <= TITLE_MAX, it.title);
  assert.ok(it.body.length <= BODY_MAX, it.body);
  assert.equal(it.title, 'جدول التوزيع اليوم في عامرية الفلوجة');
});

ok('العنوانُ الرسميّ يُلحق بغير المسجّلة حين يُعرف', () => {
  const [it] = buildMorningSeries({ forDate: DAY, rows: [row('gasoline_regular', 'محطة تعبئة وقود طليحة الحكومية', 'الرطبة')], stations: [], watchers: {} });
  assert.match(it.body, /\(الكيلو ١٦٠\)/);
});

await (async () => {
  const a = await seriesKey('series:2026-09-17:الرمادي:gasoline_premium');
  const b = await seriesKey('series:2026-09-17:الرمادي:gasoline_premium');
  const c = await seriesKey('series:2026-09-17:الرمادي:kerosene');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  n++;
  console.log('  ✓ client_key ثابتٌ للمفتاح نفسِه وصالحٌ uuid v5');
})();

// ── التوسيع: «وسّعه ليشمل المتوفّرَ الآن» ───────────────────────────────
//
// كانت السلسلةُ تُبنى من جدول التوزيع وحدَه، فمحطةٌ تعلن وقوداً على لوحتها
// وليست في جدول اليوم لا يذكرها أحد.

ok('مدينةٌ خارج الجدول تدخل السلسلةَ بما تعلنه لوحتُها الآن', () => {
  const out = buildMorningSeries({
    forDate: DAY,
    rows: [row('kerosene', 'محطة أ', 'حديثة')],
    stations: [liveStation('k1', 'محطة الكرمة', 'الكرمة', ['gasoline_premium', 'kerosene'])],
    watchers: { 'الكرمة': 1200, 'حديثة': 860 },
  });
  assert.deepEqual(
    out.map((i) => `${i.city}:${i.product}`),
    ['الكرمة:gasoline_premium', 'الكرمة:kerosene', 'حديثة:null']
  );
  assert.equal(out[0].registered, true);
  assert.equal(out[0].offeredNow, true);
  assert.equal(out[0].inSchedule, false);
  // نطاقُ المفتاح واحدٌ لا نطاقان — ونطاقٌ ثانٍ يُضاعف السلسلةَ في المرور التالي
  assert.equal(out[0].key, `series:${DAY}:الكرمة:gasoline_premium`);
});

ok('ونصُّها لا ينسب المحطةَ إلى الجدول', () => {
  const [it] = buildMorningSeries({
    forDate: DAY,
    rows: [],
    stations: [liveStation('k1', 'محطة الكرمة', 'الكرمة', ['gasoline_premium'])],
    watchers: {},
  });
  assert.equal(it.title, 'بانزين محسن متوفر الآن في الكرمة');
  assert.match(it.body, /أكّدت توفّره الآن على المنصّة/);
  assert.doesNotMatch(it.body, /جدول التوزيع/);
  assert.ok(it.title.length <= TITLE_MAX && it.body.length <= BODY_MAX);
});

ok('صباحٌ بلا جدول: السلسلةُ من اللوحات وحدَها، والصامتُ لا يدخل', () => {
  const out = buildMorningSeries({
    forDate: DAY,
    rows: [],
    stations: [
      liveStation('k1', 'محطة الكرمة', 'الكرمة', ['gasoline_premium', 'gasoline_regular']),
      station('x1', 'محطة صامتة', 'هيت'),
      liveStation('d1', 'محطة تجريبية', 'الرمادي', ['kerosene'], { is_demo: true }),
    ],
    watchers: { 'الكرمة': 1200 },
  });
  assert.deepEqual(
    out.map((i) => `${i.city}:${i.product}`),
    ['الكرمة:gasoline_premium', 'الكرمة:gasoline_regular']
  );
});

ok('المعلِنُ الآن يسبق المجدوَلَ على الخانة ولو كان أقلَّ نشاطاً', () => {
  const out = buildMorningSeries({
    forDate: DAY,
    rows: [row('gasoline_premium', 'محطة المجدولة', 'الفلوجة', 's1')],
    stations: [
      station('s1', 'محطة المجدولة', 'الفلوجة', { updates: 9, age: 1 }),
      liveStation('s2', 'محطة المعلِنة', 'الفلوجة', ['gasoline_premium'], { updates: 1 }),
    ],
    watchers: {},
  });
  assert.equal(out.length, 1, 'خانةٌ واحدةٌ للمحسن لا خانتان');
  assert.equal(out[0].stationId, 's2', 'الأنشطُ يخسر أمام من يقول «عندي الآن»');
  assert.equal(out[0].inSchedule, false);
});

ok('والجدولُ واللوحةُ يجتمعان في مدينةٍ واحدةٍ بنصَّين مختلفَين', () => {
  const out = buildMorningSeries({
    forDate: DAY,
    rows: [row('kerosene', 'محطة المجدولة', 'الرمادي', 's1')],
    stations: [
      station('s1', 'محطة المجدولة', 'الرمادي'),
      liveStation('s2', 'محطة المعلِنة', 'الرمادي', ['gasoline_premium']),
    ],
    watchers: {},
  });
  assert.deepEqual(out.map((i) => i.product), ['gasoline_premium', 'kerosene'], 'الترتيبُ باقٍ');
  assert.equal(out[0].inSchedule, false);
  assert.equal(out[1].inSchedule, true);
  assert.match(out[1].body, /في جدول التوزيع اليوم/);
});

console.log(`\n${n} فحصاً مرّت.`);
