// يفحص مفتاحَ الصيانة — وأخصُّ ما فيه أنه يُطفئ نفسَه.
//
//   node scripts/test-status.mjs
//
// **لماذا هذا الفحصُ بعينه.** المفتاحُ يُقلب في اللحظة التي يكون فيها كلُّ شيءٍ
// آخر متوقّفاً، وطريقُ إطفائه — لوحةُ الإدارة — هو نفسُه ما قد يكون معطّلاً.
// فبقاءُ الموقع مطفأً بعد انتهاء العمل عطلٌ أسوأُ من العمل نفسِه. ولذلك
// `until` شرطٌ في القراءة لا زينة، ويُفحص هنا من الجهتين: صيانةٌ بلا نهايةٍ
// لا تبدأ، وصيانةٌ انقضت نهايتُها تنتهي.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeNotice, isDown } from '../lib/status.ts';

const iso = (h) => new Date(Date.now() + h * 3600_000).toISOString();

// ــ الافتراضُ أن الموقع يعمل ــــــــــــــــــــــــــــــــــــــــــــــــ
assert.equal(isDown(null), false, 'ملفٌّ مفقودٌ يعني «يعمل»');
assert.equal(isDown({}), false, 'كائنٌ فارغٌ يعني «يعمل»');
assert.equal(isDown({ maintenance: false, until: iso(2), message: '' }), false);

// ــ الصيانةُ تعمل ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
assert.equal(isDown({ maintenance: true, until: iso(2), message: '' }), true);

// ــ وتُطفئ نفسَها ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
assert.equal(
  isDown({ maintenance: true, until: iso(-1), message: '' }),
  false,
  'مضت نهايتُها فيجب أن تنتهي وحدَها'
);
assert.equal(
  isDown({ maintenance: true, until: '', message: '' }),
  false,
  'صيانةٌ بلا نهايةٍ لا تبدأ — وإلّا صارت بلا مخرج'
);
assert.equal(
  isDown({ maintenance: true, until: 'ليس تاريخاً', message: '' }),
  false,
  'نهايةٌ غيرُ مقروءةٍ لا تُطفئ الموقع'
);

// ــ والحدُّ بالضبط عند اللحظة ــــــــــــــــــــــــــــــــــــــــــــــ
const now = Date.parse('2026-09-07T00:00:00Z');
assert.equal(isDown({ maintenance: true, until: '2026-09-07T00:00:01Z' }, now), true);
assert.equal(isDown({ maintenance: true, until: '2026-09-07T00:00:00Z' }, now), false);

// ــ والملفُّ المشحون: يُفحص شكلُه لا قيمتُه ــــــــــــــــــــــــــــــــ
//
// القيمةُ تتبدّل بإيداعٍ حقيقيّ وقت الصيانة، ففحصُها كان سيُسقط الفحوصَ كلَّها
// في أسوأ لحظة. والشكلُ هو ما يجب ألّا يتبدّل.
const file = JSON.parse(
  readFileSync(new URL('../public/status.json', import.meta.url), 'utf8')
);
assert.deepEqual(
  Object.keys(file).sort(),
  ['maintenance', 'message', 'notice', 'until'],
  'مفاتيحُ status.json أربعةٌ بالضبط — يُحرَّر بالهاتف تحت ضغط'
);
assert.equal(typeof file.maintenance, 'boolean');
assert.equal(typeof file.until, 'string');
assert.equal(typeof file.message, 'string');

// ــ الإنذارُ السابق للصيانة ــــــــــــــــــــــــــــــــــــــــــــــ
//
// وشرطُه الأهمّ أن ينصرف وحدَه: إنذارٌ يبقى معروضاً بعد وقوع ما أنذر به يصير
// كذباً على الناس، وهو ما يقع حتماً لو تُرك رفعُه ليدٍ تتذكّر.
const notice = (over, extra) => ({
  maintenance: false, until: '', message: '',
  notice: { title: 'تحديث', body: 'نصّ', until: iso(over), seconds: 5, ...extra },
});

assert.equal(activeNotice(null), null);
assert.equal(activeNotice({ maintenance: false, until: '', message: '', notice: null }), null);
assert.ok(activeNotice(notice(2)), 'إنذارٌ لم يحن وقتُه بعد يجب أن يُعرض');
assert.equal(activeNotice(notice(-1)), null, 'إنذارٌ مضى وقتُه يجب أن ينصرف وحدَه');
assert.equal(activeNotice(notice(2, { until: '' })), null, 'إنذارٌ بلا نهايةٍ لا يُعرض');
assert.equal(activeNotice(notice(2, { title: '   ' })), null, 'إنذارٌ بلا عنوانٍ لا يُعرض');
assert.equal(
  activeNotice(notice(2, { until: 'ليس تاريخاً' })),
  null,
  'نهايةٌ غيرُ مقروءةٍ لا تُبقي الإنذار'
);

assert.equal(typeof file.notice, 'object', 'notice كائنٌ أو null');

console.log('site status: all assertions passed');
