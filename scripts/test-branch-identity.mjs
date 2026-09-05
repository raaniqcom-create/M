// يفحص أن اسمَ الدخول يُحلّ إلى العنوان نفسِه في الموضعين.
//
//   node scripts/test-branch-identity.mjs
//
// **لأن الحسابَ يُسكّ في مكانٍ ويُقرأ في آخر.** السكربتُ ينشئه بعنوانٍ صناعيّ،
// وصفحةُ الدخول تشتقّ العنوانَ من المكتوب في الحقل. فلو اختلفت القاعدتان حرفاً
// واحداً، فُتح حسابٌ صحيحٌ في القاعدة لا يصل إليه أحدٌ من الباب — ولا يظهر
// الخللُ إلا بعد أن تُسلَّم البياناتُ ليدٍ لا تستطيع الدخول.
//
// ولذلك لا تُعاد كتابةُ القاعدة هنا: تُستخرج النسختان من ملفَّيهما وتُنفَّذان.
// نسخةٌ ثالثةٌ في الفحص كانت ستمرّ وهما مختلفتان.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phoneToEmail } from '../lib/phone.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** يقصّ من علامةٍ إلى نهاية العبارة.
 *
 *  وليس إلى أوّل فاصلةٍ منقوطة: جسمُ `normalizePhone` فيه ثلاثُ فواصل، والقصُّ
 *  عند أوّلها يُخرج دالّةً ناقصةً تُرمى `SyntaxError` — وهو ما وقع فعلاً عند
 *  كتابة هذا الفحص. فإن بدأ الجسمُ بقوسٍ معقوف وُزن حتى يُغلق. */
function slice(src, marker, where) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, `لم يوجد «${marker}» في ${where} — أُعيدت تسميتُه؟`);
  const open = src.indexOf('{', i);
  const semi = src.indexOf(';', i);
  let end;
  if (open >= 0 && open < semi) {
    let depth = 0;
    for (end = open; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}' && --depth === 0) break;
    }
    assert.ok(depth === 0 && end < src.length, `لم يُغلق القوسُ في ${where}`);
    end = src.indexOf(';', end) + 1;
  } else {
    end = semi + 1;
  }
  assert.ok(end > i, `لم تُغلق العبارةُ في ${where}`);
  const out = src.slice(i, end);
  assert.ok(out.length > 60, `الاستخراجُ من ${where} أقصرُ من أن يكون صحيحاً`);
  return out;
}

// ــ صفحةُ الدخول ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
const loginSrc = read('../app/login/page.tsx');
const loginExpr = slice(loginSrc, 'const email = value.includes(', 'app/login/page.tsx');
const fromLogin = new Function(
  'value',
  'phoneToEmail',
  `${loginExpr} return email;`,
);

// ــ السكربتُ الذي يفتح الحساب ــــــــــــــــــــــــــــــــــــــــــــــــ
const scriptSrc = read('./add-branch-viewer.mjs');
const scriptExpr = slice(scriptSrc, 'const toEmail = (value) =>', 'scripts/add-branch-viewer.mjs');
const normExpr = slice(scriptSrc, 'const normalizePhone = (raw) =>', 'scripts/add-branch-viewer.mjs');
const fromScript = new Function('value', `${normExpr}${scriptExpr} return toEmail(value);`);

// ــ والمطابقةُ على ما يُكتب فعلاً في الحقل ــــــــــــــــــــــــــــــــــ
const CASES = [
  'anbar1',
  'anbar-oil',
  'branch.anbar',
  'ADMIN',            // حروفٌ كبيرة: يُصغَّران معاً، فلا حسابان لاسمٍ واحد
  '07801234567',
  '7801234567',
  '+9647801234567',
  '00964 780 123 4567',
  '0780 123 4567',
  '(0780) 123-4567',
  'someone@muhta.app',
  'p7801234567',      // الصيغةُ المحجوزة — يجب أن تُقرأ اسماً في الطرفين معاً
];

for (const v of CASES) {
  assert.equal(
    fromScript(v),
    fromLogin(v, phoneToEmail),
    `اختلف الطرفان في «${v}»`,
  );
}

// ــ وما تعنيه القاعدةُ فعلاً، لا كيف كُتبت ــــــــــــــــــــــــــــــــــ
assert.equal(fromScript('anbar1'), 'anbar1@muhta.app');
assert.equal(fromScript('07801234567'), 'p7801234567@muhta.app');
assert.equal(fromScript('+9647801234567'), 'p7801234567@muhta.app');
assert.equal(fromScript('someone@muhta.app'), 'someone@muhta.app');
assert.equal(fromScript('Anbar1'), 'anbar1@muhta.app');

// الصيغُ الثلاثُ للرقم حسابٌ واحد لا ثلاثة
assert.equal(fromScript('07801234567'), fromScript('7801234567'));
assert.equal(fromScript('07801234567'), fromScript('00964 780 123 4567'));

// ــ وحارسُ الاسم ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
// بلا اسمِ المُعامل في العلامة: تغييرُ `u` إلى `raw` كسر هذا الاستخراجَ مرّةً،
// وفشلُ الفحص كان في الفحص لا في المفحوص.
const badStart = scriptSrc.indexOf('function badUsername(');
assert.ok(badStart >= 0, 'لم توجد badUsername — أُعيدت تسميتُها؟');
const badExpr = scriptSrc.slice(badStart, scriptSrc.indexOf('\n}', badStart) + 2);
assert.ok(badExpr.includes('return null'), 'لم يُستخرج badUsername كاملةً');
const badUsername = new Function(`${badExpr} return badUsername;`)();

assert.equal(badUsername('anbar1'), null);
assert.equal(badUsername('anbar-oil'), null);
assert.equal(badUsername('07801234567'), null); // رقمٌ، مسارٌ آخر
assert.ok(badUsername('ab'), 'حرفان يجب أن يُرفضا');
assert.equal(badUsername('Anbar1'), null, 'الحرفُ الكبير يُصغَّر لا يُرفض');
assert.ok(badUsername('فرع'), 'العربيةُ تُرفض: العنوانُ الصناعيّ لاتينيّ');
assert.ok(badUsername('anbar 1'), 'الفراغُ يُرفض');
// وهذا هو الاصطدامُ الذي يهمّ: اسمٌ يشبه صيغةَ الهاتف
assert.ok(badUsername('p7801234567'), 'صيغةُ p+أرقام محجوزةٌ لحسابات الهواتف');

console.log('branch identity: all assertions passed');
