// «المتوفر الآن» في البوت: هل يقول «الآن» عن خبرٍ عمرُه تسعةُ أيام؟
//
// كان يقول. `stillLive` تسأل سؤالين — أمتوفّرٌ؟ وأمرَّ موعدُ نفاده؟ — ولا
// تسأل **متى قيل ذلك**. والعيبُ كان مكتوباً في تعليقها بيدِ من كتبها:
// «والحداثةَ لا يفحصها البوتُ أصلاً — عيبٌ قائمٌ قبل هذا العمود».
//
// مقيسٌ على القاعدة الحيّة يومَ سُدّ: شاشةُ «المتوفر الآن» سبعَ عشرةَ محطة،
// **خمسٌ منها على خبرٍ أقدمَ من يوم**، وأقدمُها تسعةُ أيامٍ وثلث.
//
// ── والقسمةُ هي الفكرة ────────────────────────────────────────────────────
//
// لا تُبدَّل `stillLive` بل يُزاد عليها. فلها موضعان لا يصحّ فيهما اشتراطُ
// الحداثة، وكلاهما **لوحةُ صاحب المحطة**:
//
//   • شارتُه ✅/❌ تعني «هكذا تركتَها أنت» — لا «هكذا يراك الناسُ الآن».
//   • وزرُّه يقلب الحالةَ الظاهرة: `next = !stillLive(row)`. فلو اشتُرطت
//     الحداثةُ هنا لَقرأ الزرُّ منتجاً متوفّراً عمرُه ٢٥ ساعةً **مُطفأً**،
//     فتُشعله الضغطةُ التي أُريد بها الإطفاء. زرٌّ يفعل ضدَّ ما كُتب عليه.
//
// والقسمُ الأخيرُ في هذا الملفّ يحرس ذلك بعينه — وهو الفخُّ الذي كاد يقع.
import assert from 'node:assert';

const FRESH_MS = 24 * 3600_000;
const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

// مرآةُ supabase/functions/telegram/index.ts — والمحاكاةُ تُثبّت المعنى، فإن
// انحرف الأصلُ يوماً كان هذا الملفُّ هو ما يقول ما كان مقصوداً.
const stillLive = (p) =>
  !!p?.is_available && !(p.runs_out_at && p.runs_out_at <= new Date().toISOString());

const offeredNow = (p) => {
  if (!stillLive(p)) return false;
  if (!p?.updated_at) return false;
  const age = Date.now() - new Date(p.updated_at).getTime();
  return age >= 0 && age < FRESH_MS;
};

let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };

// ── ١ · ما لم يتغيّر: الطازجُ يمرّ، والنافدُ يسقط ─────────────────────────
{
  const fresh = { is_available: true, updated_at: ago(1), runs_out_at: null };
  ok(stillLive(fresh) && offeredNow(fresh), 'طازجٌ متوفّر → يُعرض في الحالين');

  const off = { is_available: false, updated_at: ago(1), runs_out_at: null };
  ok(!stillLive(off) && !offeredNow(off), 'مُطفأٌ → يسقط في الحالين');

  const ranOut = { is_available: true, updated_at: ago(1), runs_out_at: ago(2) };
  ok(!stillLive(ranOut) && !offeredNow(ranOut), 'مرَّ موعدُ نفاده → يسقط في الحالين');

  const runsOutLater = { is_available: true, updated_at: ago(1), runs_out_at: inHours(3) };
  ok(offeredNow(runsOutLater), 'موعدُ نفادٍ لم يحن بعدُ → يبقى معروضاً');
}

// ── ٢ · الخبرُ الشائخ: هنا وحدَه يفترق المقياسان ──────────────────────────
//
// وهذا القسمُ **يسقط قبل الإصلاح**: `stillLive` تُمرّر الثلاثةَ كلَّها.
{
  const day2 = { is_available: true, updated_at: ago(25), runs_out_at: null };
  ok(stillLive(day2), 'خمسٌ وعشرون ساعةً: ما زال ما ضبطه صاحبُه');
  ok(!offeredNow(day2), 'خمسٌ وعشرون ساعةً: لا يُقال عنه «الآن»');

  const day4 = { is_available: true, updated_at: ago(96), runs_out_at: null };
  ok(!offeredNow(day4), 'أربعةُ أيام → يسقط من «المتوفر الآن»');

  // القياسُ الحيُّ الذي استُخرج منه هذا الملفّ: أقدمُ سطرٍ كان يُعرض.
  const day9 = { is_available: true, updated_at: ago(9.3 * 24), runs_out_at: null };
  ok(!offeredNow(day9), 'تسعةُ أيامٍ وثلث → يسقط (وكان يُعرض تحت عنوان «الآن»)');

  // والحدُّ عند أربعٍ وعشرين بالضبط — هو `FRESH_HOURS` في lib/hours.ts، وبه
  // يسقط الأخضرُ في الموقع. فالسطحان يقولان الشيءَ نفسَه أو أحدُهما يكذب.
  ok(offeredNow({ is_available: true, updated_at: ago(23.9), runs_out_at: null }), 'دون الأربعٍ وعشرين → يمرّ');
  ok(!offeredNow({ is_available: true, updated_at: ago(24.1), runs_out_at: null }), 'فوقها → يسقط');
}

// ── ٣ · وصفٌّ بلا تاريخِ لمسة ─────────────────────────────────────────────
{
  const noStamp = { is_available: true, updated_at: null, runs_out_at: null };
  ok(stillLive(noStamp), 'بلا تاريخٍ: لوحةُ صاحبه تعرضه كما ضبطه');
  ok(!offeredNow(noStamp), 'بلا تاريخٍ: لا يُقال عنه «الآن» — لا نعرف متى قيل');
}

// ── ٤ · الفخُّ: زرُّ صاحب المحطة ──────────────────────────────────────────
//
// `next = !stillLive(row)` — ولو كُتبت `offeredNow` مكانَها لانقلب الزرّ.
{
  const stale = { is_available: true, updated_at: ago(30), runs_out_at: null };

  const nextCorrect = !stillLive(stale);
  ok(nextCorrect === false, 'الزرُّ على منتجٍ متوفّرٍ شائخ → يُطفئه (وهو المكتوبُ عليه)');

  const nextIfWrong = !offeredNow(stale);
  ok(nextIfWrong === true, 'ولو اشتُرطت الحداثةُ في الزرّ → لأشعله؛ فلهذا لم تُبدَّل stillLive');
  ok(nextCorrect !== nextIfWrong, 'والفرقُ بينهما ليس نظريّاً: ضغطةٌ تفعل عكسَ مرادها');
}

// ── ٥ · وشارةُ اللوحة كذلك ───────────────────────────────────────────────
{
  const stale = { is_available: true, updated_at: ago(40), runs_out_at: null };
  ok(stillLive(stale), 'شارةُ اللوحة ✅ على ما ضبطه صاحبُه ولو شاخ — وإلا رآها ❌ ولم يلمس شيئاً');
}

console.log(`✔ ${n} حالة`);
