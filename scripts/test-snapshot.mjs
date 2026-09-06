// يفحص مخزنَ «آخر حالة» — الكتابةَ والقراءةَ وبوّاباتِ الرفض.
//
//   node scripts/test-snapshot.mjs
//
// **ما يحميه.** هذا المخزنُ هو كلُّ ما يُعرض حين ينقطع الإنترنت. وأخطرُ أعطاله
// صامتة: لقطةٌ بشكلٍ قديم تُقرأ فتُسقط الصفحةَ عند `s.products.some(...)`،
// ولقطةٌ عمرُها ثلاثةُ أيّام تُعرض كأنها حالةُ اليوم. فالبوّاباتُ الثلاث —
// النسخةُ والشكلُ والعمر — هي المفحوصةُ هنا، لا الكتابةُ وحدها.
//
// ويُستخرج المنطقُ من lib/stations.ts نفسِه ويُنفَّذ: نسخةٌ ثانيةٌ مكتوبةٌ هنا
// كانت ستمرّ بينما الشيفرةُ المشحونة بلا بوّابة.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WITHDRAW_HOURS } from '../lib/hours.ts';

const src = readFileSync(new URL('../lib/stations.ts', import.meta.url), 'utf8');

const from = src.indexOf('const SNAP_KEY');
assert.ok(from >= 0, 'لم يوجد SNAP_KEY — أُعيدت تسميتُه؟');
const to = src.indexOf('\n}', src.indexOf('export function loadCachedStations'));
assert.ok(to > from, 'لم تُغلق loadCachedStations');
const block = src.slice(from, to + 2);

assert.ok(/SNAP_VERSION/.test(block), 'لا رقمَ نسخةٍ في اللقطة');
assert.ok(/WITHDRAW_HOURS/.test(block), 'لا بوّابةَ عمرٍ في القراءة');
assert.ok(/Array\.isArray\(first\.products\)/.test(block), 'لا فحصَ شكلٍ للصفّ');

// نزعُ التعليقات النوعيّة كي يُنفَّذ كجافاسكربت خالص. وأيُّ تعليقٍ جديدٍ لم
// يُنزع يُسقط الفحصَ بـSyntaxError — وهو الإسقاطُ المطلوب، لا الصمت.
const js = block
  .replace('export function cacheStations(rows: StationWithStatus[]): void {',
           'function cacheStations(rows) {')
  .replace(
    'export function loadCachedStations(): { rows: StationWithStatus[]; at: string } | null {',
    'function loadCachedStations() {'
  )
  .replace(' as { v?: number; at?: string; rows?: unknown }', '')
  .replace(' as { products?: unknown } | undefined', '')
  .replace(' as StationWithStatus[]', '');

// تخزينٌ زائف: خريطةٌ في الذاكرة، ويمكن جعلُها ترمي كما ترمي حصّةٌ ممتلئة.
let throwOnSet = false;
const mem = new Map();
const fake = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (throwOnSet) throw new DOMException('QuotaExceededError');
    mem.set(k, v);
  },
};

const make = () =>
  new Function(
    'localStorage',
    'WITHDRAW_HOURS',
    `${js} return { cacheStations, loadCachedStations };`
  )(fake, WITHDRAW_HOURS);

const { cacheStations, loadCachedStations } = make();
const ROWS = [{ id: 'a', name: 'محطة', products: [{ product: 'kerosene' }] }];

// ــ ذهابٌ وإياب ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
cacheStations(ROWS);
const back = loadCachedStations();
assert.ok(back, 'اللقطةُ لم تُقرأ بعد كتابتها');
assert.deepEqual(back.rows, ROWS);
assert.ok(!Number.isNaN(new Date(back.at).getTime()), 'ساعةُ اللقطة ليست تاريخاً');

// ــ لا لقطةَ أصلاً ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
mem.clear();
assert.equal(loadCachedStations(), null, 'مخزنٌ فارغٌ يجب أن يردّ null');

// ــ رقمُ نسخةٍ مختلف: بناءٌ قديمٌ لا يُحيا ــــــــــــــــــــــــــــــــــ
mem.clear();
mem.set('stations-snapshot', JSON.stringify({ v: 99, at: new Date().toISOString(), rows: ROWS }));
assert.equal(loadCachedStations(), null, 'نسخةٌ مختلفةٌ يجب أن تُرفض');

// ــ شكلٌ ناقص: هذا هو ما يُسقط الصفحة ــــــــــــــــــــــــــــــــــــــ
mem.clear();
cacheStations([{ id: 'a', name: 'محطة' }]); // بلا products
assert.equal(loadCachedStations(), null, 'صفٌّ بلا products يجب أن يُرفض');

// ــ العمر ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
const at = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const put = (iso) =>
  mem.set('stations-snapshot', JSON.stringify({ v: 2, at: iso, rows: ROWS }));

mem.clear(); put(at(1));
assert.ok(loadCachedStations(), 'ساعةٌ واحدةٌ يجب أن تُقبل');

mem.clear(); put(at(WITHDRAW_HOURS - 1));
assert.ok(loadCachedStations(), 'دون حدّ السحب يجب أن تُقبل');

mem.clear(); put(at(WITHDRAW_HOURS + 1));
assert.equal(loadCachedStations(), null, 'فوق حدّ السحب يجب أن تُرفض');

// وساعةُ جهازٍ مضبوطةٌ خطأً تجعل اللقطةَ «في المستقبل»
mem.clear(); put(at(-5));
assert.equal(loadCachedStations(), null, 'لقطةٌ في المستقبل يجب أن تُرفض');

// ــ وحصّةٌ ممتلئة لا تُسقط الصفحة ــــــــــــــــــــــــــــــــــــــــــ
mem.clear();
throwOnSet = true;
assert.doesNotThrow(() => cacheStations(ROWS), 'فشلُ الكتابة يجب أن يُبتلع');
throwOnSet = false;

// ــ وJSON مكسور ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
mem.clear();
mem.set('stations-snapshot', '{ليس');
assert.equal(loadCachedStations(), null, 'JSON مكسورٌ يجب أن يردّ null لا أن يرمي');

console.log('stations snapshot: all assertions passed');
