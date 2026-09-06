// يفحص أن loadStations تعيد المحاولة ولا تستسلم عند أوّل سقوط.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/stations.ts', import.meta.url), 'utf8');

// يُستخرج جسمُ الحلقة من الملفّ نفسِه، فلا تمرّ نسخةٌ ثالثةٌ صحيحةٌ في الفحص
// بينما الشيفرةُ المشحونة بلا إعادة.
const i = src.indexOf('export async function loadStations');
assert.ok(i >= 0, 'لم توجد loadStations');
const body = src.slice(i, src.indexOf('async function fetchStations', i));
assert.ok(/for \(let attempt = 0; attempt < 3; attempt\+\+\)/.test(body), 'لا حلقةَ ثلاثِ محاولات');
assert.ok(/return await fetchStations\(\)/.test(body), 'لا نداءَ داخل المحاولة');
assert.ok(/throw last/.test(body), 'الفشلُ النهائيّ يجب أن يُرمى لا يُبتلع');

// وسلوكيّاً: دالّةٌ تسقط مرّتين ثمّ تنجح يجب أن تُرجع القيمة لا الخطأ.
// التعليقُ النوعيُّ الوحيدُ في الجسم يُنزع كي يُنفَّذ كجافاسكربت خالص —
// وهو أرخصُ من مُترجمٍ في الفحص، وينكسر بوضوحٍ إن أُضيف نوعٌ ثانٍ.
const js = body
  .slice(body.indexOf('let last'), body.lastIndexOf('}'))
  .replace('let last: unknown;', 'let last;');
assert.ok(!/:\s*(unknown|string|number|Promise)/.test(js), 'بقي تعليقٌ نوعيٌّ في الجسم');
const loop = new Function('fetchStations', `return (async () => {${js}})();`);

let calls = 0;
const flaky = async () => { if (++calls < 3) throw new Error('network'); return ['ok']; };
assert.deepEqual(await loop(flaky), ['ok']);
assert.equal(calls, 3, 'كان يجب أن تُنادى ثلاثاً');

calls = 0;
const dead = async () => { calls++; throw new Error('down'); };
await assert.rejects(loop(dead), /down/);
assert.equal(calls, 3, 'ثلاثُ محاولاتٍ ثمّ يُرمى الخطأ الأخير');

calls = 0;
const fine = async () => { calls++; return ['once']; };
assert.deepEqual(await loop(fine), ['once']);
assert.equal(calls, 1, 'النجاحُ من أوّل مرّةٍ لا يُعيد');

console.log('stations retry: all assertions passed');
