// `loadStations`: متى تُعيد المحاولة، **ومتى تمتنع**.
//
// ── ولماذا أُعيدت كتابةُ هذا الملفّ ──────────────────────────────────────
//
// كان يحرس حلقةَ ثلاثِ محاولاتٍ لأيّ فشلٍ كان. وقد أُبدلت تلك الحلقةُ عمداً
// يومَ ٢٠٢٦-٠٩-٠٨ — يومَ سقطت القاعدةُ سقوطاً تامّاً — لأنّها كانت تعيد
// المحاولةَ على خطأِ الخادم أيضاً: فكلُّ جهازٍ يرمي على القاعدة الساقطة
// **ثلاثةَ أضعافِ** ما كان يرمي، والعلاجُ يزيد المرض. والتعليقُ في
// lib/stations.ts يقول ذلك بنصّه.
//
// ولم يُحدَّث الفحصُ معها، فبقي يسقط أبداً — وفحصٌ يسقط دائماً لا يحرس شيئاً،
// بل يُعلّم قارئَه أن يتجاوز الأحمر. فيُصلَح إلى العقد القائم.
//
// ── والقسمُ الرابعُ هو لبُّ التغيير ──────────────────────────────────────
//
// «انقطاعٌ ← أعِد» و«جوابُ خادمٍ ← لا تُعِد» ليسا تفصيلاً في الأداء: الأوّل
// عطبُ الشبكة عند المستخدم وحدَه، والثاني عطبٌ عامٌّ تُضاعفه الإعادة. فمن
// أعاد على الاثنين حوّل انقطاعاً قصيراً إلى انقطاعٍ طويل.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/stations.ts', import.meta.url), 'utf8');

// يُستخرج جسمُ الدالّة من الملفّ نفسِه، فلا يمرّ في الفحص عقدٌ صحيحٌ بينما
// الشيفرةُ المشحونة على غيره. والحدُّ نهايةُ الدالّة لا أوّلُ ما بعدها.
const i = src.indexOf('export async function loadStations');
assert.ok(i >= 0, 'لم توجد loadStations');
const fn = src.slice(i, src.indexOf(String.fromCharCode(10) + '}', i) + 2);

// ── ١ · العقدُ مقروءاً من النصّ ──────────────────────────────────────────
assert.ok(/await fetchStations\(\)/.test(fn), 'لا نداءَ للجلب');
assert.ok(/cacheStations\(/.test(fn), 'اللقطةُ لا تُكتب بعد الجلب الناجح');
assert.ok(/if \(!isAborted\(e\)\) throw e;/.test(fn), 'الحارسُ الذي يمنع الإعادةَ على خطأ الخادم مفقود');
assert.ok(!/attempt < 3/.test(fn), 'عادت حلقةُ الثلاثِ محاولات — وهي التي ضاعفت الحِملَ على قاعدةٍ ساقطة');
// والمهلةُ منصوصةٌ كي لا تصير صفراً بالسهو (فتُنادى الثانيةُ على شبكةٍ لم تعد
// بعد) ولا ثلاثين ثانيةً (فتتجمّد الواجهة).
assert.ok(/setTimeout\(r, 500\)/.test(fn), 'مهلةُ النصف ثانيةٍ بين المحاولتين مفقودة');

// ── ٢ · وسلوكيّاً ────────────────────────────────────────────────────────
//
// يُنفَّذ الجسمُ نفسُه كجافاسكربت خالص بحقنِ ما يناديه. وهو أرخصُ من مُترجمٍ
// في الفحص، وينكسر بوضوحٍ إن أُضيف تعليقٌ نوعيٌّ في الجسم.
const js = fn.slice(fn.indexOf('{') + 1, fn.lastIndexOf('}'));
assert.ok(!/:\s*(unknown|string|number|Promise|StationWithStatus)/.test(js), 'بقي تعليقٌ نوعيٌّ في الجسم');

const noop = () => {};
// و`setTimeout` يُظلَّل بفوريٍّ: الفحصُ عن المحاولة الثانية لا عن انتظارها.
const run = (fetchStations, isAborted) =>
  new Function(
    'fetchStations',
    'cacheStations',
    'isAborted',
    'setTimeout',
    `return (async () => {${js}})();`,
  )(fetchStations, noop, isAborted, (f) => f());

const ABORT = new Error('aborted');
const SERVER = new Error('500 from PostgREST');
const isAborted = (e) => e === ABORT;

// ── ٣ · النجاحُ من أوّل مرّةٍ لا يُعيد ───────────────────────────────────
{
  let calls = 0;
  const fine = async () => { calls++; return ['once']; };
  assert.deepEqual(await run(fine, isAborted), ['once']);
  assert.equal(calls, 1, 'النجاحُ من أوّل مرّةٍ لا يُعيد');
}

// ── ٤ · الانقطاعُ يُعاد مرّةً — وجوابُ الخادم لا يُعاد أبداً ─────────────
{
  let calls = 0;
  const flaky = async () => { if (++calls < 2) throw ABORT; return ['ok']; };
  assert.deepEqual(await run(flaky, isAborted), ['ok'], 'انقطاعٌ ثمّ نجاح → تُرجَع القيمة');
  assert.equal(calls, 2, 'محاولةٌ ثانيةٌ واحدةٌ للانقطاع');
}
{
  let calls = 0;
  const down = async () => { calls++; throw SERVER; };
  await assert.rejects(run(down, isAborted), /PostgREST/);
  assert.equal(
    calls,
    1,
    'خطأُ خادمٍ يُرمى من أوّل نداء — والإعادةُ هنا تضاعف الحِملَ على ما سقط منه',
  );
}

// ── ٥ · وانقطاعٌ لا ينتهي: محاولتان ثمّ يُرمى، لا ثلاث ──────────────────
{
  let calls = 0;
  const gone = async () => { calls++; throw ABORT; };
  await assert.rejects(run(gone, isAborted), /aborted/);
  assert.equal(calls, 2, 'محاولتان لا أكثر، ثمّ يُرمى الخطأ');
}

console.log('إعادةُ محاولة المحطات: ٥ أقسامٍ تمرّ — والانقطاعُ وحدَه يُعاد.');
