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
import { looksLikeSchedule, parseSchedule, readProduct } from '../lib/schedule.ts';

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
assert.equal(a.names.length, 7, `سبعةُ أسماء، وقُرئ ${a.names.length}`);
assert.ok(!a.names.some((n) => n.includes('غدا')), 'صدرُ المنشور يجب أن يُسقَط');
assert.ok(
  !a.names.some((n) => n.includes('المحطات')),
  'وسطرُ العنوان لا يُعدّ محطة'
);
assert.ok(a.names.some((n) => n.includes('الامن')), 'الامن من الأسماء');
assert.ok(a.names.some((n) => n.includes('السينما')), 'السينما من الأسماء');

const b = parseSchedule(POST_B);
assert.ok(b, 'لم يُقرأ منشورُ السطر الواحد');
assert.equal(b.product, 'gasoline_premium');
assert.equal(b.names.length, 1, 'سطرٌ واحدٌ = محطةٌ واحدة');
assert.ok(b.names[0].includes('مها'), `بقي الاسم: «${b.names[0]}»`);
assert.ok(!b.names[0].includes('تجهيز'), 'كلمةُ «تجهيز» تُسقط');

const c = parseSchedule(POST_C);
assert.ok(c);
assert.equal(c.names.length, 7);
assert.ok(c.names.some((n) => n.includes('الواحه') || n.includes('الواحة')));

// ــ وما ليس جدولاً لا يُقرأ ــــــــــــــــــــــــــــــــــــــــــــــــ
assert.equal(parseSchedule('محطة السينما'), null, 'بلا وقودٍ لا يُقرأ');
assert.equal(parseSchedule(''), null);
assert.equal(parseSchedule('غدا ان شاء الله البنزين العادي'), null, 'عنوانٌ بلا أسماء');

console.log('schedule parse: all assertions passed');
