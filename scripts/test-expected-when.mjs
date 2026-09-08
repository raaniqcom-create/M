// جملةُ الوعد: «متوقع غداً ٦:٠٠ صباحاً» — وما يجب ألّا يُقال.
//
// ── من أين جاءت ───────────────────────────────────────────────────────────
//
// اتّصل صاحبُ محطةٍ فقال إنّ وعداً بلا ساعةٍ لا يُبنى عليه قرار: مسافرٌ يقرأ
// «غداً» لا يعرف أيخرج فجراً أم عصراً. فصار للوعد ساعةٌ اختياريّة.
//
// ── والحارسُ الذي كان مكرَّراً أربعَ مرّات ───────────────────────────────
//
// «متوقع غداً» و«الصباح» كانتا تُركَّبان بيدهما في أربعة أسطح — البطاقة،
// وصفحةُ المحطة، ولوحةُ المالك، ولوحةُ الفرع — وكلٌّ يُعيد كتابةَ حارس
// `isExpectedLate`. ونُسي مرّةً فطُبع على الموقع الحيّ **«تأخّر ١١ يوماً
// الصباح»**: فترةُ يومٍ مضى، معلَّقةٌ بلا معنى. فجُمعت في `expectedText`.
import assert from 'node:assert/strict';

const PERIOD_LABELS = { morning: 'الصباح', afternoon: 'العصر', evening: 'المساء' };

// مرآةُ formatTime في lib/hours.ts:57 — وتقبل "HH:MM:SS" كما تُرجعها PostgREST.
const timeToMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const formatTime = (time) => {
  const total = timeToMinutes(time);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'صباحاً' : 'مساءً';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

// مرآةُ whenLabel.
const whenLabel = (period, time) => (time ? formatTime(time) : period ? PERIOD_LABELS[period] : '');

// مرآةُ expectedLabel و isExpectedLate و expectedText في lib/products.ts.
const plural = (n, one, two, few, many) =>
  n === 1 ? one : n === 2 ? two : `${n} ${n <= 10 ? few : many}`;
const dayDiff = (iso, today) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
const expectedLabel = (iso, today) => {
  const d = dayDiff(iso, today);
  if (d < 0) return `تأخّر ${plural(-d, 'يوماً', 'يومين', 'أيام', 'يوماً')}`;
  if (d === 0) return 'متوقع اليوم';
  if (d === 1) return 'متوقع غداً';
  if (d === 2) return 'متوقع بعد غد';
  return `متوقع خلال ${d} أيام`;
};
const expectedText = (row, today) => {
  if (!row.expected_at) return '';
  const head = expectedLabel(row.expected_at, today);
  if (dayDiff(row.expected_at, today) < 0) return head;
  const tail = whenLabel(row.expected_period, row.expected_time);
  return tail ? `${head} ${tail}` : head;
};

const TODAY = '2026-09-09';
let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };
const eq = (a, b) => { assert.equal(a, b); n++; };

// ── ١ · الساعةُ تغلب الفترة ──────────────────────────────────────────────
{
  eq(expectedText({ expected_at: '2026-09-10', expected_time: '06:00:00' }, TODAY),
     'متوقع غداً 6:00 صباحاً');
  // وجمعُهما حشوٌ يُقرأ مرّتين — فالساعةُ وحدَها تظهر.
  eq(expectedText({ expected_at: '2026-09-10', expected_period: 'morning', expected_time: '06:00:00' }, TODAY),
     'متوقع غداً 6:00 صباحاً');
  ok(!expectedText({ expected_at: '2026-09-10', expected_period: 'morning', expected_time: '06:00:00' }, TODAY)
       .includes('الصباح'),
     'ولا تظهر الفترةُ معها');
}

// ── ٢ · والفترةُ حيث لا ساعة ─────────────────────────────────────────────
{
  eq(expectedText({ expected_at: '2026-09-10', expected_period: 'afternoon' }, TODAY), 'متوقع غداً العصر');
  eq(expectedText({ expected_at: '2026-09-09' }, TODAY), 'متوقع اليوم');
  eq(expectedText({ expected_at: '2026-09-11', expected_period: 'evening' }, TODAY), 'متوقع بعد غد المساء');
}

// ── ٣ · ووعدٌ فات: لا ذيلَ إطلاقاً ───────────────────────────────────────
//
// وهذا القسمُ هو الذي كان يسقط في الشيفرة الحيّة: طُبع «تأخّر ١١ يوماً الصباح».
{
  eq(expectedText({ expected_at: '2026-08-29', expected_period: 'morning' }, TODAY), 'تأخّر 11 يوماً');
  eq(expectedText({ expected_at: '2026-09-08', expected_time: '18:00:00' }, TODAY), 'تأخّر يوماً');
  eq(expectedText({ expected_at: '2026-09-07', expected_time: '06:00:00' }, TODAY), 'تأخّر يومين');
  ok(!expectedText({ expected_at: '2026-08-29', expected_time: '06:00:00' }, TODAY).includes(':'),
     'ولا ساعةَ في وعدٍ فات — تصف لحظةً لم تقع');
}

// ── ٤ · وساعةٌ بلا يومٍ لا تُعرض — والقاعدةُ تمنع كتابتها أصلاً ──────────
{
  eq(expectedText({ expected_time: '06:00:00' }, TODAY), '');
  eq(expectedText({ expected_period: 'morning' }, TODAY), '');
  eq(expectedText({}, TODAY), '');
}

// ── ٥ · حوافُّ formatTime ────────────────────────────────────────────────
{
  eq(formatTime('06:00:00'), '6:00 صباحاً');
  eq(formatTime('00:30:00'), '12:30 صباحاً');
  eq(formatTime('12:00:00'), '12:00 مساءً');
  eq(formatTime('23:45:00'), '11:45 مساءً');
  // وصيغةُ حقل <input type="time"> بلا ثوانٍ — تُقرأ كما هي.
  eq(formatTime('18:30'), '6:30 مساءً');
}

// ── ٦ · وهل يُميّز؟ ──────────────────────────────────────────────────────
{
  // الشيفرةُ القديمة: الفترةُ تُلحق بلا نظرٍ في الساعة، والحارسُ يُنسى.
  const old = (row, today) =>
    `${expectedLabel(row.expected_at, today)}${row.expected_period ? ` ${PERIOD_LABELS[row.expected_period]}` : ''}`;
  ok(old({ expected_at: '2026-08-29', expected_period: 'morning' }, TODAY) === 'تأخّر 11 يوماً الصباح',
     'القديمُ يطبع «تأخّر 11 يوماً الصباح» — وهو ما وقع فعلاً');
  ok(old({ expected_at: '2026-09-10', expected_time: '06:00:00' }, TODAY) === 'متوقع غداً',
     'والقديمُ لا يعرف الساعةَ أصلاً');
}

console.log(`✔ ${n} تحقّقاً — والساعةُ تغلب، والوعدُ الفائت بلا ذيل.`);
