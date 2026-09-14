// «حالة المحطة»: من له قصّةٌ الآن، ومن يراها.
//
// القاعدةُ قاعدةُ `isOffered`: متوفّرٌ أُكّد خلال ٢٤ ساعة، لم يمرّ موعدُ نفاده،
// والمحطةُ مفتوحة. والتصفيةُ باهتمامات القارئ: مدنُه ومنتجاتُه، والفارغُ الكلّ.
import assert from 'node:assert/strict';
import { platformShort, shortName, storiesFor as allStories } from '../lib/stories.ts';

// حالاتُ المنصّة تُفصل عن قصص المحطات في الفحوص — الترتيبُ بالزمن للجميع.
const storiesFor = (stations, choice) => allStories(stations, choice).filter((s) => s.kind !== 'platform');

const H = 3600e3;
const ago = (h) => new Date(Date.now() - h * H).toISOString();
const later = (h) => new Date(Date.now() + h * H).toISOString();

const station = (id, city, products, extra = {}) => ({
  id,
  name: `محطة وقود ${id}`,
  slug: id,
  city,
  is_24h: true,
  opens_at: '00:00:00',
  closes_at: '23:59:59',
  temp_closed: false,
  products,
  traffic: null,
  productTraffic: [],
  ...extra,
});
const row = (product, o = {}) => ({
  product,
  is_available: true,
  updated_at: ago(1),
  runs_out_at: null,
  expected_at: null,
  ...o,
});

let n = 0;
const ok = (label, fn) => {
  fn();
  n++;
  console.log(`  ✓ ${label}`);
};

ok('متوفّرٌ أُكّد قبل ساعة → قصّة', () => {
  assert.equal(storiesFor([station('الحق', 'الرمادي', [row('kerosene')])], null).length, 1);
});
ok('أُكّد قبل ٢٥ ساعة → لا قصّة', () => {
  assert.equal(storiesFor([station('a', 'الرمادي', [row('kerosene', { updated_at: ago(25) })])], null).length, 0);
});
ok('موعدُ النفاد مضى → لا قصّة', () => {
  assert.equal(storiesFor([station('a', 'الرمادي', [row('kerosene', { runs_out_at: ago(0.1) })])], null).length, 0);
});
ok('موعدُ النفاد لم يحن → قصّة', () => {
  assert.equal(storiesFor([station('a', 'الرمادي', [row('kerosene', { runs_out_at: later(3) })])], null).length, 1);
});
ok('مغلقةٌ مؤقّتاً → لا قصّة', () => {
  assert.equal(storiesFor([station('a', 'الرمادي', [row('kerosene')], { temp_closed: true })], null).length, 0);
});
ok('غيرُ متوفّرٍ (متوقّع فقط) → لا قصّة', () => {
  assert.equal(
    storiesFor([station('a', 'الرمادي', [row('kerosene', { is_available: false, expected_at: '2030-01-01' })])], null).length,
    0
  );
});
ok('اختيارُ «الرمادي» يُسقط الفلوجة', () => {
  const s = storiesFor(
    [station('r', 'الرمادي', [row('kerosene')]), station('f', 'الفلوجة', [row('kerosene')])],
    { cities: ['الرمادي'], products: [] }
  );
  assert.deepEqual(s.map((x) => x.id), ['r']);
});
ok('اختيارُ «كاز» يُسقط محطةً بانزينُها وحدَه متوفّر، ويُبقي الكازَ فقط في الصورة', () => {
  const s = storiesFor(
    [
      station('b', 'الرمادي', [row('gasoline_regular')]),
      station('k', 'الرمادي', [row('kerosene'), row('gasoline_regular')]),
    ],
    { cities: [], products: ['kerosene'] }
  );
  assert.deepEqual(s.map((x) => x.id), ['k']);
  assert.deepEqual(s[0].products, ['kerosene']);
});
ok('بلا اختيارٍ → الكلّ، والأحدثُ أوّلاً', () => {
  const s = storiesFor(
    [
      station('old', 'الرمادي', [row('kerosene', { updated_at: ago(5) })]),
      station('new', 'الفلوجة', [row('kerosene', { updated_at: ago(1) })]),
    ],
    null
  );
  assert.deepEqual(s.map((x) => x.id), ['new', 'old']);
});
ok('at = أحدثُ تأكيدٍ بين المنتجات المعروضة', () => {
  const s = storiesFor([station('a', 'الرمادي', [row('kerosene', { updated_at: ago(3) }), row('gas', { updated_at: ago(1) })])], null);
  assert.ok(Date.now() - Date.parse(s[0].at) < 1.5 * H);
});
ok('shortName يُبقي الاسمَ البارزَ وحدَه', () => {
  assert.equal(shortName('محطة وقود الحق المشيدة'), 'الحق');
  assert.equal(shortName('محطة تعبئة وقود الرمادي الحكومية الطريق السريع'), 'الرمادي');
  assert.equal(shortName('محطة وقود الوئام المشيده'), 'الوئام');
  assert.equal(shortName('محطة الهضاب مشيده'), 'الهضاب');
  assert.equal(shortName('محطة ركن الجامعة'), 'ركن الجامعة');
  assert.equal(shortName('محطة بوابة الرمادي النموذجيه'), 'بوابة الرمادي');
  assert.equal(shortName('محطة دار السلام قرب سيطرة التحدي'), 'دار السلام');
  assert.equal(shortName('محطة وقود الدليم المشيدة للمنتوجات النفطية'), 'الدليم');
  assert.equal(shortName('محطة تعبئة الوقود النافع'), 'النافع');
  assert.equal(shortName('الأمن'), 'الأمن');
  assert.equal(shortName('محطة'), 'محطة');
});
ok('خبرُ الإدارة عن محطةٍ غير مسجّلة قصّةٌ حمراء — بمدنه ومنتجه، ولا يُعرض المسجّلُ ولا المنتهي', () => {
  const ann = (o) => ({
    id: 'a1', station_name: 'محطة الرحاب', origin_city: 'الفلوجة', product: 'kerosene', cities: ['الفلوجة'],
    send_at: ago(1), yes_votes: 0, no_votes: 0, admin_verdict: null, admin_until: null, station_id: null, as_popup: false, ...o,
  });
  const only = (rows, choice) => allStories([], choice, rows).filter((s) => s.kind === 'announced');
  assert.equal(only([ann({})], null).length, 1);
  assert.equal(only([ann({})], null)[0].id, 'ann:a1');
  assert.equal(only([ann({})], null)[0].short, 'الرحاب');
  assert.equal(only([ann({})], { cities: ['الرمادي'], products: [] }).length, 0);
  assert.equal(only([ann({})], { cities: ['الفلوجة'], products: ['gasoline_regular'] }).length, 0);
  assert.equal(only([ann({})], { cities: ['الفلوجة'], products: ['kerosene'] }).length, 1);
  assert.equal(only([ann({ station_id: 'x' })], null).length, 0);
  assert.equal(only([ann({ admin_verdict: 'gone' })], null).length, 0);
});

ok('اسمُ حلقة المنصّة من عنوانها', () => {
  assert.equal(platformShort('تعبئة العبوات البلاستيكية: أين؟'), 'العبوات');
  assert.equal(platformShort('دوري — الفرديّ والزوجيّ'), 'دوري');
  assert.equal(platformShort('CarPlay — المحطة التقنية على شاشة سيارتك'), 'CarPlay');
  assert.equal(platformShort('الآيفون: حدّث التطبيق — 3 ميغا فقط'), 'الآيفون');
});

ok('الأحدثُ أوّلاً — للمنصّة والمحطات سواء', () => {
  const p = { id: 'p1', title: 'ت', lines: ['أ'], image_url: null, href: '/x', label: 'x', published_at: ago(3) };
  const s = allStories([station('fresh', 'الرمادي', [row('kerosene', { updated_at: ago(1) })])], null, [], [p]);
  assert.deepEqual(s.map((x) => x.id), ['fresh', 'p1']);
});

ok('حالاتُ المنصّة من القاعدة ولو بلا محطات — ولا شيءَ بلا صفوف', () => {
  const row = { id: 'p1', title: 'ت', lines: ['أ'], image_url: null, href: '/abwat', label: 'x', published_at: ago(1) };
  const s = allStories([], null, [], [row]);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, 'platform');
  assert.equal(s[0].at, row.published_at);
  assert.ok(s[0].news.href);
  assert.equal(allStories([], null).length, 0);
});

console.log(`\n✔ ${n} تحقّقاً — القصّةُ اشتقاقٌ من isOffered، والاهتماماتُ ترشّح.`);
