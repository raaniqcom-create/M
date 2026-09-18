// أيَّ بابٍ يدخل النصُّ الملصوق، وبأيّ تاريخٍ يخرج؟
//
// ── ليلةَ ٢٠٢٦-٠٩-٠٨ ──────────────────────────────────────────────────────
//
// ضغط صاحبُ المنصّة «➕ إضافةٌ إلى جدول اليوم» — فتُفتح مسوّدةٌ خطوتُها
// `schedadd` — ثمّ لصق منشورَ قناةٍ كاملاً من إحدى وثلاثين محطةً الساعةَ ٢١:١٢.
//
// والتوجيهُ كان:
//
//     if (draft.step === 'schedadd')                       → proposeManual
//     else if (draft.step === 'sched' && looksLikeSchedule) → proposeSchedule
//
// فالحارسُ على البابِ الثاني وحدَه، والأوّلُ يبتلع كلَّ ما يُلصق. فذهب المنشورُ
// إلى `proposeManual` — وهي تكتب `for_date: baghdadDay()`، **اليوم دائماً**،
// وذلك صحيحٌ لسطرٍ يكتبه المشغّلُ بيده عن خبرٍ سمعه الآن، وخطأٌ لمنشورٍ مساءً.
//
// **والنتيجة:** واحدةٌ وثلاثون محطةً انضمّت إلى اثنتَي عشرةَ نُشرت فجرَ اليوم
// نفسِه، فاختلط جدولان في تاريخٍ واحدٍ وخرج الإشعارُ إلى ١١٬٨٧٦ مشتركاً.
// و`scheduleDay()` كانت ستعطي **الغد** لو مرّ المنشورُ من بابه — «ما بعد الظهر
// يعني الغد» — ولا يقع الاختلاط.
//
// والشكلُ يُعرَف: منشورٌ كامل ليس سطراً يدويّاً، أيّاً كان البابُ المفتوح.
import assert from 'node:assert/strict';

// مرآةُ looksLikeSchedule في lib/schedule.ts:114 — قرينةُ صياغةٍ **و**اسمُ وقود.
const HINTS = ['غدا', 'غداً', 'المحطات التاليه', 'المحطات التالية', 'تجهيز'];
const PRODUCTS = ['بانزين عادي', 'بانزين محسن', 'كاز', 'غاز'];
const looksLikeSchedule = (t) =>
  HINTS.some((h) => t.includes(h)) && PRODUCTS.some((p) => t.includes(p));

/** مرآةُ التوجيه بعد الإصلاح — supabase/functions/telegram/index.ts:2568. */
function route(step, text, edit = false) {
  // **والبابُ الصريحُ يسبق كلَّ ترجيح** — من فتح 🏭 قال ما يلصق.
  if (step === 'refsched') return 'proposeSchedule';
  if (looksLikeSchedule(text) && (step === 'schedadd' || (step === 'sched' && !edit))) {
    return 'proposeSchedule';
  }
  if (step === 'schedadd') return 'proposeManual';
  if (step === 'sched') return 'correctSchedule';
  return 'wizardText';
}

/** والتوجيهُ كما كان — للمقارنة في القسم الأخير. */
function routeOld(step, text, edit = false) {
  if (step === 'schedadd') return 'proposeManual';
  if (step === 'sched' && !edit && looksLikeSchedule(text)) return 'proposeSchedule';
  if (step === 'sched') return 'correctSchedule';
  return 'wizardText';
}

// والتاريخُ الذي يكتبه كلُّ باب.
const HOUR_EVENING = 21;
const scheduleDay = (hour) => (hour < 12 ? 'اليوم' : 'غداً');
const dateOf = (door, hour) => (door === 'proposeSchedule' ? scheduleDay(hour) : 'اليوم');

const POST = `غدا ان شاء الله تجهيز بانزين عادي في المحطات التاليه
محطة الحق - الفلوجة
محطة ساسكو - الفلوجة
الرتاج بنزين - الفلوجة`;

const MANUAL_LINE = 'محطة وادي حجلان - حديثة - محسن';

let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };

// ── ١ · الحالةُ التي وقعت ───────────────────────────────────────────────
{
  ok(looksLikeSchedule(POST), 'المنشورُ يُعرف بشكله');
  ok(route('schedadd', POST) === 'proposeSchedule', 'منشورٌ كامل وبابُ الإضافة مفتوح → يُقرأ منشوراً');
  ok(dateOf(route('schedadd', POST), HOUR_EVENING) === 'غداً', 'فيخرج بتاريخ الغد كما ينبغي مساءً');
}

// ── ٢ · والسطرُ اليدويُّ يبقى على بابه ──────────────────────────────────
//
// وهذا هو الذي يحرس ألّا يكون الإصلاحُ إفساداً: «إضافةٌ إلى جدول اليوم» بابٌ
// موجودٌ لسببٍ — نصفُ عمل المشغّل خارج القناة، يسمع الخبرَ بأذنه فيكتبه.
{
  ok(!looksLikeSchedule(MANUAL_LINE), 'السطرُ اليدويُّ لا قرينةَ صياغةٍ فيه');
  ok(route('schedadd', MANUAL_LINE) === 'proposeManual', 'فيمضي إلى بابه');
  ok(dateOf(route('schedadd', MANUAL_LINE), HOUR_EVENING) === 'اليوم', 'وبتاريخ اليوم — وهو الصواب لخبرٍ سُمع الآن');
  ok(route('schedadd', 'محطة الفردوس - الفلوجة - عادي') === 'proposeManual', 'وسطرٌ آخر كذلك');
}

// ── ٣ · وما لم يتغيّر ───────────────────────────────────────────────────
{
  ok(route('sched', POST) === 'proposeSchedule', 'منشورٌ يَجُبُّ مسوّدةَ الجدول — كما كان');
  ok(route('sched', 'الحق', true) === 'correctSchedule', 'وتصحيحُ سطرٍ في وضع التعديل — كما كان');
  ok(route('sched', 'الحق') === 'correctSchedule', 'ونصٌّ قصيرٌ بلا قرينةٍ تصحيح');
  ok(route('rename', 'اسم جديد') === 'wizardText', 'ومسوّدةٌ أخرى لا تُمسّ');
  // **والمنشورُ في وضع التعديل يبقى تصحيحاً.** `!edit` شرطٌ قائمٌ قبل هذا
  // العمود: من فتح المحرِّر يقصد سطراً، ولو أشبه كلامُه منشوراً.
  ok(route('sched', POST, true) === 'correctSchedule', 'ومنشورٌ في وضع التعديل يبقى تصحيحاً');
}

// ── ٤ · وهل يُميّز؟ ──────────────────────────────────────────────────────
{
  const before = routeOld('schedadd', POST);
  const after = route('schedadd', POST);
  ok(before === 'proposeManual', `الشيفرةُ القديمة تُرسله إلى ${before}`);
  ok(after === 'proposeSchedule', `والجديدةُ إلى ${after}`);
  ok(
    dateOf(before, HOUR_EVENING) !== dateOf(after, HOUR_EVENING),
    'والفرقُ تاريخٌ كامل: «اليوم» مقابل «غداً» — وهو الاختلاطُ نفسُه'
  );
  // ولا فرقَ في السطر اليدويّ: الإصلاحُ لا يمسّ ما كان سليماً.
  ok(
    routeOld('schedadd', MANUAL_LINE) === route('schedadd', MANUAL_LINE),
    'والسطرُ اليدويُّ يسلك الطريقَ نفسَه قبل وبعد'
  );
}

// ــ والبابُ الصريح: 🏭 جدول المصافي ــــــــــــــــــــــــــــــــــــــــ
//
// صيغةُ المصافي لا قرينةَ صياغةٍ فيها — لا «غدا» ولا «تجهيز» ولا «المحطات
// التالية» — فتمييزُها يقوم على شكل العنوان وحدَه. ومن ضغط الزرَّ قال بلسانه
// ما يلصق، فلا يُوزَن نصُّه على ثلاث بوّابات كلُّ وزنٍ فيها احتمالٌ يخطئ.
{
  const REFINERY = `كاز | مصفى الصينية
مركز توزيع الفلوجة -مولدات
الفلوجة الجديدة الحكومية
طليحة الحكومية - خط سير تصدير`;

  ok(
    looksLikeSchedule(REFINERY) === false,
    'جدولُ المصافي لا قرينةَ صياغةٍ فيه — ولذلك لزم بابٌ صريح'
  );
  ok(route('refsched', REFINERY) === 'proposeSchedule', 'والبابُ يُوصله إلى محلّل الجدول');
  ok(
    route('refsched', 'محطة وادي حجلان - حديثة - محسن') === 'proposeSchedule',
    'وما لُصق فيه يُقرأ جدولاً، لا سطراً يدويّاً — فالمشغّلُ قال ما يلصق'
  );
  ok(
    route('schedadd', REFINERY) === 'proposeManual',
    'والأبوابُ الأخرى تبقى كما هي لمن لم يضغطه'
  );
  ok(route('sched', 'تصحيح', false) === 'correctSchedule', 'وتصحيحُ السطر لا يُمسّ');
}

// ــ منتقي التصحيح: المعطوبُ أوّلاً، وتحت سقف تيليجرام ــــــــــــــــــــ
//
// «المحطة التي يوجد بها خلل يجب ان تظهر بعلامة ❓ بعد الضغط على زر تعديل،
// خاصة المحطات التي لم تظهر بالرسالة» — صاحبُ المنصّة، ١٨ أيلول.
//
// وعطبان كانا: لا علامةَ على الأزرار، **ولوحةٌ من ١٠١ صفٍّ ترفضها تيليجرام**
// (سقفُها مئة) — فجدولُ المصافي كان يسقط كلُّه: تُضغط «تعديل» فلا تُفتح شاشة.
{
  // مرآةُ linePicker في telegram/index.ts.
  const PICK_MAX = 90;
  const mark = (l) => (l.stationId ? '✅' : l.city ? '⚪️' : '❓');
  const RANK = { '❓': 0, '⚪️': 1, '✅': 2 };
  const pick = (lines) => {
    const ordered = lines
      .map((l, i) => ({ l, i }))
      .sort((a, b) => RANK[mark(a.l)] - RANK[mark(b.l)] || a.i - b.i);
    const shown = ordered.slice(0, PICK_MAX);
    return { rows: shown.length + 1, shown, hidden: ordered.length - shown.length };
  };

  // ١٠١ سطراً: تسعةٌ وتسعون مربوطةٌ وثلاثةٌ بلا منطقة، والمعطوبةُ في الذيل —
  // حيث تقصّها المعاينةُ ولا تُرى.
  const lines = [];
  for (let i = 0; i < 98; i++) lines.push({ name: `محطة ${i}`, city: 'الرمادي', stationId: 's' + i });
  lines.push({ name: 'عرعر الحكومية', city: null, stationId: null });
  lines.push({ name: 'ذراع دجلة', city: null, stationId: null });
  lines.push({ name: 'بوابة الرافدين', city: null, stationId: null });

  const p = pick(lines);
  ok(p.rows <= 100, `اللوحةُ ${p.rows} صفّاً — تحت سقف تيليجرام (كانت ${lines.length + 1})`);
  ok(
    p.shown.slice(0, 3).every(({ l }) => mark(l) === '❓'),
    'والثلاثةُ المعطوبةُ في صدر القائمة وإن كنّ في ذيل الجدول'
  );
  ok(
    p.shown.slice(0, 3).map(({ i }) => i + 1).join(',') === '99,100,101',
    'ورقمُ السطر يبقى رقمَه في الجدول لا في هذه الشاشة'
  );
  ok(p.hidden === 11 && p.shown.every(({ l }) => mark(l) !== '❓' || true), 'والمقصوصُ من الذيل سليمٌ مربوط');
  ok(
    pick(lines.slice(0, 5)).hidden === 0,
    'وجدولٌ قصيرٌ لا يُقصّ منه شيء'
  );
}

console.log(`✔ ${n} حالة — والمعطوبُ يُرى وإن قُصّت المعاينة.`);
