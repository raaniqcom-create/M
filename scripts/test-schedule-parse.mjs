// يفحص قراءةَ منشور الجدول — على منشوراتٍ حقيقيّةٍ لا مخترَعة.
//
//   node scripts/test-schedule-parse.mjs
//
// **الثلاثةُ أدناه منقولةٌ حرفيّاً** من القناة التي يصل منها الجدول
// (@Benzene_ramadi، الثامنةَ والنصفَ مساءً). ومنشورٌ مخترَعٌ في الفحص يُخفي
// بالضبط ما جاء الفحصُ ليمسكه: الإملاءَ الفعليّ، والصياغةَ المتبدّلة، وموضعَ
// اسم الوقود.
//
// وأخطرُ عقدةٍ هنا ليست القراءة بل **التمييز**: نصُّ الرسالة في البوت اليوم
// بحثٌ عن محطة، فلو قُرئ كلُّ نصٍّ جدولاً لصار كلُّ من كتب اسمَ محطةٍ ناشراً.
import assert from 'node:assert/strict';
import {
  looksLikeSchedule,
  parseSchedule,
  readManualLine,
  readProduct,
} from '../lib/schedule.ts';

// ــ منشورٌ ذو عنوان، سبعةُ أسماء (٢٠:٣٢) ــــــــــــــــــــــــــــــــــــ
const POST_A = `غدا ان شاء الله البنزين العادي في المحطات التالية
السريع البريشة
الامن
السينما
ريف الجزيرة البعلي جاسم
غصن الزيتون جويبة
الخالدية قرب مركز الخالدية
الحبانية القديمة يم سيطرة الخالدية`;

// ــ منشورٌ من سطرٍ واحد، والوقودُ في آخره (٢٠:٢٩) ــــــــــــــــــــــــــ
const POST_B = `غدا ان شاء الله محطة مها البادية البعبود العيادة تجهيز بنزين محسن`;

// ــ منشورٌ ثالث، سبعةُ أسماء (٢١:٣٦) ــــــــــــــــــــــــــــــــــــــــ
const POST_C = `غدا ان شاء الله البنزين العادي في المحطات التالية
الصابرين
الحق
الاوائل
الواحة الخضراء
الامن
السينما
نور الحياة`;

// ــ الوقود ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
assert.equal(readProduct('البنزين العادي'), 'gasoline_regular');
assert.equal(readProduct('بانزين عادي'), 'gasoline_regular');
assert.equal(readProduct('تجهيز بنزين محسن'), 'gasoline_premium');
assert.equal(readProduct('كاز'), 'kerosene');
assert.equal(readProduct('لا وقودَ هنا'), null);

// «محسن» تحوي «بانزين»، فلو فُحص الأقصرُ أوّلاً لَغلب الخطأ
assert.equal(readProduct('غدا بنزين محسن'), 'gasoline_premium', 'الأطولُ يسبق الأقصر');

// ــ التمييز: جدولٌ أم بحث؟ ــــــــــــــــــــــــــــــــــــــــــــــــــ
assert.ok(looksLikeSchedule(POST_A), 'منشورٌ حقيقيٌّ يجب أن يُقرأ جدولاً');
assert.ok(looksLikeSchedule(POST_B), 'والمنشورُ ذو السطر الواحد كذلك');
assert.ok(looksLikeSchedule(POST_C));

assert.equal(looksLikeSchedule('محطة السينما'), false, 'بحثٌ عن محطةٍ ليس جدولاً');
assert.equal(looksLikeSchedule('الرمادي'), false, 'اسمُ مدينةٍ ليس جدولاً');
assert.equal(looksLikeSchedule('وين اكو بانزين'), false, 'سؤالٌ فيه وقودٌ بلا قرينةِ جدول');
assert.equal(looksLikeSchedule('غدا ان شاء الله نلتقي'), false, 'قرينةٌ بلا وقودٍ ليست جدولاً');
assert.equal(looksLikeSchedule(''), false);

// ــ القراءة ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
const a = parseSchedule(POST_A);
assert.ok(a, 'لم يُقرأ المنشور الأوّل');
assert.equal(a.product, 'gasoline_regular');
assert.equal(a.rows.length, 7, `سبعةُ أسماء، وقُرئ ${a.rows.length}`);
assert.ok(!a.rows.some(({ name: n }) => n.includes('غدا')), 'صدرُ المنشور يجب أن يُسقَط');
assert.ok(
  !a.rows.some(({ name: n }) => n.includes('المحطات')),
  'وسطرُ العنوان لا يُعدّ محطة'
);
assert.ok(a.rows.some(({ name: n }) => n.includes('الامن')), 'الامن من الأسماء');
assert.ok(a.rows.some(({ name: n }) => n.includes('السينما')), 'السينما من الأسماء');

const b = parseSchedule(POST_B);
assert.ok(b, 'لم يُقرأ منشورُ السطر الواحد');
assert.equal(b.product, 'gasoline_premium');
assert.equal(b.rows.length, 1, 'سطرٌ واحدٌ = محطةٌ واحدة');
assert.ok(b.rows[0].name.includes('مها'), `بقي الاسم: «${b.rows[0].name}»`);
assert.ok(!b.rows[0].name.includes('تجهيز'), 'كلمةُ «تجهيز» تُسقط');

const c = parseSchedule(POST_C);
assert.ok(c);
assert.equal(c.rows.length, 7);
assert.ok(c.rows.some(({ name: n }) => n.includes('الواحه') || n.includes('الواحة')));

// ــ وما ليس جدولاً لا يُقرأ ــــــــــــــــــــــــــــــــــــــــــــــــ
assert.equal(parseSchedule('محطة السينما'), null, 'بلا وقودٍ لا يُقرأ');
assert.equal(parseSchedule(''), null);
assert.equal(parseSchedule('غدا ان شاء الله البنزين العادي'), null, 'عنوانٌ بلا أسماء');

console.log('schedule parse: all assertions passed');


// ــ ومنشوران في رسالةٍ واحدة، وقودان ــــــــــــــــــــــــــــــــــــــ
//
// **وقع فعلاً.** لصق صاحبُ المنصّة المنشورين معاً، فقرأ البوتُ الثمانيةَ
// «عاديّاً» — والثامنُ محسّن — وبقيت كلمةُ «محسن» في اسمه لأنّ المُسقَط كان
// كلماتِ «عادي» لا كلماتِه. خبرٌ خطأ عن وقودٍ يقطع الناسُ إليه الطريق، واسمٌ
// مشوَّه، في عطلٍ واحد.
const MIXED = `${POST_A}
محطة مها البادية البعبود العيادة تجهيز بنزين محسن`;
const m = parseSchedule(MIXED);
assert.ok(m, 'لم يُقرأ المنشور المُلصَق');
assert.equal(m.rows.length, 8, `ثمانيةُ أسماء، وقُرئ ${m.rows.length}`);
assert.equal(
  m.rows.filter((r) => r.product === 'gasoline_regular').length,
  7,
  'سبعةٌ على العادي'
);
const prem = m.rows.filter((r) => r.product === 'gasoline_premium');
assert.equal(prem.length, 1, 'وواحدةٌ على المحسّن');
assert.ok(prem[0].name.includes('مها'), `اسمُ المحسّن: «${prem[0].name}»`);
assert.ok(!prem[0].name.includes('محسن'), `«محسن» بقيت في الاسم: «${prem[0].name}»`);
assert.ok(!prem[0].name.includes('بنزين'), `«بنزين» بقيت في الاسم: «${prem[0].name}»`);

// وسطرٌ لا يسمّي وقوداً يأخذ وقودَ العنوان — لا وقودَ السطر الذي قبله.
assert.equal(m.rows[0].product, 'gasoline_regular');
assert.equal(m.rows[6].product, 'gasoline_regular');

console.log('قراءةُ الجدول: كلُّ الفحوص سليمة.');


// ــ ومنشوران لكلٍّ عنوانُه ــــــــــــــــــــــــــــــــــــــــــــــــــ
//
// القناةُ تنشر رسالتين لا رسالة، والرصدُ يدمج دفعةَ الليلة في عرضٍ واحد. فإن
// كان لكلِّ رسالةٍ عنوانُها وجب أن يجري الوقودُ مع العناوين: ما تحت الثاني له،
// لا لوقود الأوّل. ولولا ذلك لَنُسبت محطاتُ المحسّن إلى العادي.
const TWO_HEADS = `غدا ان شاء الله البنزين العادي في المحطات التالية
الامن
السينما
غدا ان شاء الله البنزين المحسن في المحطات التالية
الواحة الخضراء
نور الحياة`;
const th = parseSchedule(TWO_HEADS);
assert.ok(th, 'لم يُقرأ المنشوران');
assert.equal(th.rows.length, 4, `أربعةُ أسماء، وقُرئ ${th.rows.length}`);
assert.deepEqual(
  th.rows.map((r) => r.product),
  ['gasoline_regular', 'gasoline_regular', 'gasoline_premium', 'gasoline_premium'],
  'الوقودُ يجري مع العناوين'
);
assert.ok(!th.rows.some((r) => r.name.includes('المحطات')), 'العنوانُ الثاني ليس محطة');

console.log('عنوانان في منشورٍ واحد: سليم.');


// ــ سطرٌ يكتبه صاحبُ المنصّة بيده ــــــــــــــــــــــــــــــــــــــــــ
//
// نصفُ عمله اليوميّ خارجُ القناة: يتّصل به أصحابُ محطات فيكتب الخبرَ كما
// يُملى عليه — الاسمُ والمنطقةُ والوقود في سطر. ولصقُه في البوت كان يردّ
// «لا توجد نتائج»، لأنّ النصَّ الحرَّ بحثٌ عن محطة لا خبرٌ عنها.
for (const [line, name, city, product] of [
  ['محطة وادي حجلان - حديثة - محسن', 'محطة وادي حجلان', 'حديثة', 'gasoline_premium'],
  ['محطة الشهداء ، الفلوجة ، عادي', 'محطة الشهداء', 'الفلوجة', 'gasoline_regular'],
  ['محطة النصر | الرمادي | كاز', 'محطة النصر', 'الرمادي', 'kerosene'],
  // وبلا فواصل: يُقرأ الوقودُ والمنطقةُ من السطر كلِّه وتُنزع كلماتُهما
  ['محطة وادي حجلان حديثة محسن', 'محطة وادي حجلان', 'حديثة', 'gasoline_premium'],
  // واسمُ محطةٍ هو اسمُ ناحيتها لا يُبتلع: الجزءُ الأوّلُ اسمٌ دائماً
  ['محطة الخالدية - الخالدية - عادي', 'محطة الخالدية', 'الخالدية', 'gasoline_regular'],
]) {
  const m = readManualLine(line);
  assert.ok(m, `لم يُقرأ: «${line}»`);
  assert.equal(m.name, name, `اسمُ «${line}»`);
  assert.equal(m.city, city, `منطقةُ «${line}»`);
  assert.equal(m.product, product, `وقودُ «${line}»`);
}

// وما نقص يبقى فارغاً ولا يُخمَّن — الأزرارُ تسأل عنه.
const half = readManualLine('محطة بلا منطقة - سوبر');
assert.equal(half.city, null, 'منطقةٌ لم تُذكر لا تُخمَّن');
assert.equal(half.product, 'gasoline_super');

const bare = readManualLine('الامن');
assert.equal(bare.name, 'الامن');
assert.equal(bare.product, null, 'اسمٌ مجرَّدٌ بلا وقود');

console.log('السطرُ اليدويّ: سليم.');
