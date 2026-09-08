// الحالاتُ الثلاث: متوفر · متوقّع · غير متوفر — وما تكتبه كلٌّ منها.
//
// ── من أين جاءت ───────────────────────────────────────────────────────────
//
// «نحن نجبر على وضع كلمة متوقع غدا وهذه عدم مصداقية مع الزبون، فنرجو إضافة
// خيار: منتج غير متوفر - متوفر - متوقع، ويحدد الوقت.» — صاحبُ محطة.
//
// والحالاتُ الثلاثُ كانت في القاعدة أصلاً، والناقصُ اسمٌ وزرٌّ لِـ«لا شيء
// عندي ولا أعِد بشيء». وقِيس يومَ كُتب هذا: **أربعَ عشرةَ محطةً من إحدى
// وأربعين تبقى ظاهرةً بالوعد وحدَه**.
//
// ── والقسمُ الرابعُ هو الفخّ ──────────────────────────────────────────────
//
// `is_available = true` **مع** `expected_at` حالةٌ شرعيّةٌ ويجب أن تبقى: هي
// التي تُنتج سطرَ «وصل ✓» في لوحة الجدول — الوعدُ يُدخل المحطةَ اللوحةَ،
// وصيرورةُ التوفّر صادقةً تجعله وصولاً. فمحوُ `expected_at` عند ضغطة «متوفر»
// يكسر اللوحةَ صمتاً، وهو أسهلُ خطأٍ يقع في هذا التغيير.
import assert from 'node:assert/strict';

const NOW = '2026-09-09T10:00:00.000Z';

/** مرآةُ setState في app/owner/page.tsx — جسمُ التصحيح الذي يُرسَل. */
function patchFor(next, was) {
  const ranOut = next !== 'in' && was ? NOW : null;
  return {
    is_available: next === 'in',
    updated_at: NOW,
    ...(next === 'in' ? { runs_out_at: null } : ranOut ? { runs_out_at: ranOut } : {}),
    ...(next === 'out' ? { expected_at: null, expected_period: null, expected_time: null } : {}),
  };
}

/** ومرآةُ setExpected. */
function expectedPatch(expected_at, period, time, was) {
  return {
    expected_at,
    expected_period: expected_at === null ? null : period,
    expected_time: expected_at === null ? null : time,
    updated_at: NOW,
    ...(expected_at ? { is_available: false, ...(was ? { runs_out_at: NOW } : {}) } : {}),
  };
}

/** والحالةُ كما تُقرأ من الصفّ — مرآةُ ProductControl. */
const stateOf = (row) => (row.is_available ? 'in' : row.expected_at ? 'soon' : 'out');

let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };
const has = (o, k, v, what) => { assert.equal(o[k], v, what); n++; };

// ── ١ · «متوفر» ─────────────────────────────────────────────────────────
{
  const p = patchFor('in', false);
  has(p, 'is_available', true, 'متوفر → is_available');
  has(p, 'runs_out_at', null, 'والإشعالُ يُصفّر موعدَ النفاد');
  ok(!('expected_at' in p), '**ولا يمسّ expected_at** — وإلّا انكسر سطرُ «وصل ✓» في اللوحة');
  ok(!('expected_period' in p) && !('expected_time' in p), 'ولا ذيلَه');
}

// ── ٢ · «غير متوفر» — الحالةُ التي لم يكن لها زرّ ───────────────────────
{
  const p = patchFor('out', true);
  has(p, 'is_available', false, 'غير متوفر → مُطفأ');
  has(p, 'expected_at', null, '**ويمحو الوعدَ صراحةً** — وهذا ما طلبته المحطة');
  has(p, 'expected_period', null, 'ومعه الفترة');
  has(p, 'expected_time', null, 'ومعه الساعة');
  has(p, 'runs_out_at', NOW, 'وقد كان متوفّراً فهو نفادٌ الآن');

  const q = patchFor('out', false);
  ok(!('runs_out_at' in q), 'ولم يكن متوفّراً فلا نفادَ يُكتب — الشرطُ الانتقالُ لا الإطفاء');
}

// ── ٣ · «متوقّع» ────────────────────────────────────────────────────────
{
  const p = expectedPatch('2026-09-10', 'morning', null, true);
  has(p, 'is_available', false, 'وعدٌ يعني أنّه ليس متوفّراً الآن');
  has(p, 'expected_at', '2026-09-10', 'واليومُ يُكتب');
  has(p, 'expected_period', 'morning', 'ومعه الفترة');
  has(p, 'runs_out_at', NOW, 'وقد كان متوفّراً فهو نفادٌ أيضاً — كـ«غير متوفر»');

  const q = expectedPatch('2026-09-10', null, '06:00', false);
  has(q, 'expected_time', '06:00', 'وساعةٌ بدل فترة');
  ok(!('runs_out_at' in q), 'ولم يكن متوفّراً فلا نفاد');

  // ورفعُ اليومِ يمحو ذيلَه — والقاعدةُ تمنع ساعةً بلا يومٍ على كلّ حال.
  const r = expectedPatch(null, 'morning', '06:00', false);
  has(r, 'expected_period', null, 'رفعُ اليوم يمحو الفترة');
  has(r, 'expected_time', null, 'ويمحو الساعة');
  ok(!('is_available' in r), 'ولا يمسّ التوفّر');
}

// ── ٤ · والحالةُ الرابعةُ شرعيّة: متوفّرٌ ومعه وعد ──────────────────────
{
  const row = { is_available: true, expected_at: '2026-09-09' };
  ok(stateOf(row) === 'in', 'متوفّرٌ ومعه وعدٌ يُقرأ «متوفر»');
  // وسطرُ اللوحة: الوعدُ لليوم يُدخلها، والتوفّرُ يجعله «وصل ✓».
  const boardState = (r, day) =>
    r.expected_at === day && r.is_available ? 'arrived' : r.expected_at === day ? 'expected' : null;
  ok(boardState(row, '2026-09-09') === 'arrived', 'واللوحةُ تقول «وصل ✓»');
  ok(boardState({ ...row, is_available: false }, '2026-09-09') === 'expected', 'وبلا توفّرٍ «متوقّع»');
  // ولو محت «متوفر» الوعدَ لسقط السطرُ من اللوحة رأساً.
  const afterWrongIn = { ...row, ...patchFor('in', false), expected_at: null };
  ok(boardState(afterWrongIn, '2026-09-09') === null,
     'ولو مُحي الوعدُ عند «متوفر» لسقط السطرُ من اللوحة صمتاً');
}

// ── ٥ · وقراءةُ الحالات الثلاث من الصفوف ────────────────────────────────
{
  ok(stateOf({ is_available: true, expected_at: null }) === 'in', 'متوفّر');
  ok(stateOf({ is_available: false, expected_at: '2026-09-10' }) === 'soon', 'متوقّع');
  ok(stateOf({ is_available: false, expected_at: null }) === 'out', 'غير متوفر');
}

// ── ٦ · سياجُ انحدار: المقاييسُ الثلاثة لا تتغيّر ───────────────────────
//
// `isOffered` و`isStaleOffer` و`isListed` لا تقرأ `expected_time` إطلاقاً،
// ويجب أن تعطي النتيجةَ نفسَها قبل هذا العمود وبعده.
{
  const FRESH = 24 * 3600e3, WITHDRAW = 48 * 3600e3;
  const t = Date.parse(NOW);
  const fresh = (u) => u && t - Date.parse(u) < FRESH;
  const withdrawn = (u) => !u || t - Date.parse(u) >= WITHDRAW;
  const ranOut = (r) => !!r && t >= Date.parse(r);
  const isOffered = (r) => !!r.is_available && fresh(r.updated_at) && !ranOut(r.runs_out_at);
  const isListed = (r) =>
    (!!r.is_available && !withdrawn(r.updated_at) && !ranOut(r.runs_out_at)) || !!r.expected_at;

  const ago = (h) => new Date(t - h * 3600e3).toISOString();
  let checked = 0;
  for (const is_available of [true, false])
    for (const updated_at of [ago(1), ago(30), ago(60)])
      for (const runs_out_at of [null, ago(2), new Date(t + 3600e3).toISOString()])
        for (const expected_at of [null, '2026-09-10'])
          for (const expected_time of [null, '06:00:00']) {
            const withCol = { is_available, updated_at, runs_out_at, expected_at, expected_time };
            const without = { is_available, updated_at, runs_out_at, expected_at };
            assert.equal(isOffered(withCol), isOffered(without));
            assert.equal(isListed(withCol), isListed(without));
            checked++;
          }
  n += 1;
  ok(checked === 72, `${checked} تقاطعاً: العمودُ الجديد لا يُغيّر مقياساً قائماً`);
}

console.log(`✔ ${n} تحقّقاً — والحالاتُ ثلاثٌ، والرابعةُ تبقى شرعيّة.`);
