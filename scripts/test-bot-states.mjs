// الحالاتُ الثلاث في البوتين: الدوران، وحدودُ المنصّتين.
//
// «نرجو إضافة خيار: منتج غير متوفر - متوفر - متوقع، ويحدد الوقت» — صاحبُ محطة.
// والزرُّ الدائرُ اختيارُ صاحب المنصّة: شاشةٌ ضيّقةٌ لا تسع ثلاثةَ أزرارٍ لكلّ
// منتجٍ من سبعة.
//
// وهذا الملفُّ يحرس ثلاثةَ أشياءَ لا يكشفها إلا فحص:
//
//   ١ · الدورةُ تعود إلى نقطتها في ثلاث، ولا تتخطّى حالة.
//   ٢ · `callback_data` في تيليجرام سقفُه **٦٤ بايتاً** — والقالبُ الساذج
//       يتجاوزه، فحُملت الفهارسُ بدل الأسماء.
//   ٣ · `sendList` في واتساب **تقصّ عند العشرة صامتةً** وتقصّ العنوانَ عند
//       أربعةٍ وعشرين — فالزيادةُ لا تُخطئ بل تُسقط صفّاً بلا سطرٍ في سجلّ.
import assert from 'node:assert/strict';

const TODAY = '2026-09-09';
const TOMORROW = '2026-09-10';

// مرآةُ supabase/functions/_shared/state.ts
const stillLive = (r) => !!r?.is_available && !(r.runs_out_at && r.runs_out_at <= '2026-09-09T12:00:00Z');
const stateOf = (r) => (stillLive(r) ? 'in' : r?.expected_at ? 'soon' : 'out');
const nextState = (c) => (c === 'in' ? 'soon' : c === 'soon' ? 'out' : 'in');
const PERIOD_WORD = { morning: 'الصباح', afternoon: 'العصر', evening: 'المساء' };
const hourWord = (t) => {
  const h = Number(t.slice(0, 2));
  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)} ${h < 12 ? 'صباحاً' : 'مساءً'}`;
};
const dayWord = (d) =>
  d === TODAY ? 'اليوم' : d === TOMORROW ? 'غداً' : d < TODAY ? 'فات موعده' : d;
const whenWord = (p, t) => (t ? hourWord(t) : p ? (PERIOD_WORD[p] ?? '') : '');
const promiseWord = (r) => {
  if (!r.expected_at) return '';
  const head = dayWord(r.expected_at);
  if (r.expected_at < TODAY) return head;
  const tail = whenWord(r.expected_period, r.expected_time);
  return tail ? `${head} ${tail}` : head;
};

let n = 0;
const ok = (c, w) => { assert.ok(c, w); n++; };
const eq = (a, b, w) => { assert.equal(a, b, w); n++; };

// ── ١ · الدورة ──────────────────────────────────────────────────────────
{
  eq(nextState('in'), 'soon', 'متوفر ← متوقّع');
  eq(nextState('soon'), 'out', 'متوقّع ← غير متوفر');
  eq(nextState('out'), 'in', 'غير متوفر ← متوفر');
  // ثلاثُ ضغطاتٍ تعود بك إلى حيث بدأت — ولا حالةَ رابعة.
  let s = 'in';
  const seen = [];
  for (let i = 0; i < 3; i++) { s = nextState(s); seen.push(s); }
  eq(s, 'in', 'ثلاثُ ضغطاتٍ تُعيدك إلى المبدأ');
  eq(new Set(seen).size, 3, 'ولا تتخطّى الدورةُ حالةً');
}

// ── ٢ · وقراءةُ الحالة من الصفّ ─────────────────────────────────────────
{
  eq(stateOf({ is_available: true }), 'in', 'متوفّر');
  eq(stateOf({ is_available: false, expected_at: TOMORROW }), 'soon', 'وعدٌ بلا توفّر');
  eq(stateOf({ is_available: false }), 'out', 'لا هذا ولا ذاك');
  // موعدُ نفادٍ مضى يُطفئ عند الناس — فالزرُّ يقرأ الظاهرَ لا الخام، وإلّا
  // احتاج المالكُ ضغطتين ليُشعل ما هو مطفأٌ أصلاً.
  eq(stateOf({ is_available: true, runs_out_at: '2026-09-09T06:00:00Z' }), 'out', 'نفد فسقط');
  // ومتوفّرٌ ومعه وعدٌ يُقرأ «متوفر» — والوعدُ يبقى ليجعل سطرَ الجدول «وصل ✓».
  eq(stateOf({ is_available: true, expected_at: TODAY }), 'in', 'الحالةُ الرابعةُ تُقرأ in');
}

// ── ٣ · نصُّ الوعد على الزرّ ────────────────────────────────────────────
{
  eq(promiseWord({ expected_at: TOMORROW, expected_time: '06:00' }), 'غداً 6:00 صباحاً');
  eq(promiseWord({ expected_at: TOMORROW, expected_period: 'evening' }), 'غداً المساء');
  eq(promiseWord({ expected_at: TODAY }), 'اليوم');
  eq(promiseWord({}), '', 'لا وعدَ فلا نصّ');
  // والساعةُ تغلب الفترة — «الصباح ٦:٠٠» حشوٌ يُقرأ مرّتين.
  eq(promiseWord({ expected_at: TODAY, expected_period: 'morning', expected_time: '18:30' }), 'اليوم 6:30 مساءً');
  // ولا ذيلَ لموعدٍ فات: يصف لحظةً لم تقع.
  eq(promiseWord({ expected_at: '2026-09-01', expected_time: '06:00' }), 'فات موعده');
}

// ── ٤ · ميزانيّةُ تيليجرام: ٦٤ بايتاً ───────────────────────────────────
{
  const id = 'ceaecc0a-3643-40d4-b9ac-bd2219f4be9c'; // معرّفٌ حقيقيّ، ٣٦ محرفاً
  const cb = [
    `t:${id}:gasoline_regular`,
    `e:${id}`,
    `e:${id}:6`,
    `xd:${id}:6:2`,
    `xp:${id}:6:m`,
    `xh:${id}:6:21`,
    `xc:${id}:6`,
    `r:${id}`,
  ];
  for (const x of cb) {
    ok(Buffer.byteLength(x, 'utf8') <= 64, `${Buffer.byteLength(x, 'utf8')} بايت — ${x.slice(0, 12)}…`);
  }
  // **ونفيٌ مؤكَّد**: القالبُ الساذج — الاسمُ والتاريخُ بدل الفهرسِ والإزاحة.
  const naive = `x:${id}:gasoline_regular:2026-09-09`;
  ok(
    Buffer.byteLength(naive, 'utf8') === 66,
    `القالبُ الساذج ٦٦ بايتاً فيسقط — ولهذا حُملت الفهارس (${Buffer.byteLength(naive, 'utf8')})`
  );
}

// ── ٥ · حدودُ واتساب: عشرةُ صفوفٍ وأربعةٌ وعشرون محرفاً ─────────────────
//
// و`sendList` تقصّ صامتةً — فالفحصُ هو الموضعُ الوحيد الذي يكشف الزيادة.
{
  const PRODUCTS = [
    'بانزين عادي', 'بانزين محسن', 'بانزين سوبر', 'كاز', 'غاز', 'LPG', 'نفط أبيض',
  ];
  const MARK = { in: '✅', soon: '🕒', out: '⛔' };
  const rows = PRODUCTS.map((p) => ({ title: `${MARK.soon} ${p}` }));
  ok(rows.length <= 10, `لوحةُ المالك ${rows.length} صفوف`);
  for (const r of rows) {
    ok([...r.title].length <= 24, `العنوان «${r.title}» ${[...r.title].length} محرفاً`);
  }
  // والوعدُ في الوصف لا العنوان: «نفط أبيض» مع يومٍ وساعةٍ يتجاوز الأربعةَ
  // والعشرين — فيُقصّ ويضيع الخبر.
  const tooLong = `${MARK.soon} نفط أبيض · غداً 6:00 صباحاً`;
  ok([...tooLong].length > 24, `ولو وُضع في العنوان لَقُصّ (${[...tooLong].length} محرفاً)`);
  const desc = 'متوقّع غداً 6:00 صباحاً — اضغط ليصير غير متوفر';
  ok([...desc].length <= 72, `والوصفُ يسعه (${[...desc].length} من ٧٢)`);
}

console.log(`✔ ${n} تحقّقاً — الدورةُ ثلاثٌ، والمفاتيحُ تحت السقف، والصفوفُ تحت العشرة.`);
