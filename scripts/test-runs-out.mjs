// موعدُ النفاد المُعلَن: هل يُغلق التوفّر في المقاييس الثلاثة معاً؟
//
// المنطقُ مُحاكًى هنا كما في بقية اختبارات هذا المجلد — والمحاكاةُ تُثبّت
// **المعنى** المقصود، فإن انحرف lib/products.ts عنه يوماً كان هذا الملفّ هو
// ما يقول ما كان مقصوداً.
//
// والمصيدةُ التي يحرسها آخرُ قسمٍ فيه حقيقية: لو حُرست `isOffered` وحدَها
// لسقط المنتجُ النافدُ الطازج من الأخضر ومن الرمادي معاً، فيبقى في قائمة
// المعروض ويهبط إلى فرع «متوقَّع» الكهرمانيّ — شريحةُ ترقّبٍ على وقودٍ نفد.
import assert from 'node:assert';

const FRESH_HOURS = 24;
const WITHDRAW_HOURS = 48;
const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

const isFresh = (u) => {
  if (!u) return false;
  const age = Date.now() - new Date(u).getTime();
  return age >= 0 && age < FRESH_HOURS * 3600_000;
};
const isWithdrawn = (u) => (!u ? true : Date.now() - new Date(u).getTime() >= WITHDRAW_HOURS * 3600_000);
const hasRunOut = (r) => !!r && Date.now() >= new Date(r).getTime();

const isOffered = (open, row) =>
  !!row?.is_available && isFresh(row.updated_at) && !hasRunOut(row.runs_out_at) && open;
const isStaleOffer = (row) =>
  !!row?.is_available && !isFresh(row.updated_at) && !isWithdrawn(row.updated_at) && !hasRunOut(row.runs_out_at);
const isListed = (row) =>
  (!!row?.is_available && !isWithdrawn(row.updated_at) && !hasRunOut(row.runs_out_at)) || !!row?.expected_at;

const OPEN = true;
let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };

// ── ١ · بلا موعدِ نفاد: السلوكُ كما كان بالضبط ───────────────────────────
{
  const fresh = { is_available: true, updated_at: ago(1), runs_out_at: null };
  ok(isOffered(OPEN, fresh), 'طازجٌ بلا موعد → أخضر');
  ok(isListed(fresh), 'طازجٌ بلا موعد → معروض');
  ok(!isStaleOffer(fresh), 'طازجٌ ليس رمادياً');

  const stale = { is_available: true, updated_at: ago(30), runs_out_at: null };
  ok(!isOffered(OPEN, stale), 'شائخٌ ليس أخضر');
  ok(isStaleOffer(stale), 'شائخٌ رماديّ');
  ok(isListed(stale), 'شائخٌ ما زال معروضاً');

  const gone = { is_available: true, updated_at: ago(60), runs_out_at: null };
  ok(!isListed(gone), 'ما مضى عليه يومان يُسحب من العرض');
}

// ── ٢ · موعدٌ لم يحن: لا شيء يتغيّر ──────────────────────────────────────
{
  const row = { is_available: true, updated_at: ago(1), runs_out_at: inHours(3) };
  ok(isOffered(OPEN, row), 'موعدٌ بعد ثلاث ساعات لا يمنع الأخضر');
  ok(isListed(row), 'وموعدٌ لم يحن لا يُسقط من العرض');
}

// ── ٣ · موعدٌ مضى: يُغلق في المقاييس الثلاثة ─────────────────────────────
{
  const justRan = { is_available: true, updated_at: ago(1), runs_out_at: ago(0.1) };
  ok(!isOffered(OPEN, justRan), 'نفد قبل ستّ دقائق → لا أخضر ولو كان الخبر طازجاً');
  ok(!isStaleOffer(justRan), 'ولا رمادي — النفادُ تصحيحٌ من صاحبه لا سكوتٌ عنه');
  ok(!isListed(justRan), 'ولا يُعرض أصلاً');

  const staleAndRan = { is_available: true, updated_at: ago(30), runs_out_at: ago(20) };
  ok(!isOffered(OPEN, staleAndRan) && !isStaleOffer(staleAndRan) && !isListed(staleAndRan),
    'شائخٌ ونافدٌ معاً → مُغلقٌ في الثلاثة');
}

// ── ٤ · موعدُ الوصول لا يُبطله النفاد بل يُكمله ──────────────────────────
{
  const ranButExpected = {
    is_available: true, updated_at: ago(1), runs_out_at: ago(1), expected_at: '2026-09-04',
  };
  ok(!isOffered(OPEN, ranButExpected), 'نفد الآن → لا أخضر');
  ok(isListed(ranButExpected), '«نفد الآن ويصل غداً» تبقى معروضة — إخفاؤها يمحو نصفَها النافع');
}

// ── ٥ · التأكيدُ يُحيي، والإشعالُ يُصفّر ─────────────────────────────────
{
  const dead = { is_available: true, updated_at: ago(1), runs_out_at: ago(2) };
  ok(!isListed(dead), 'قبل التأكيد: مخفيّ');
  const revived = { ...dead, updated_at: new Date().toISOString(), runs_out_at: null };
  ok(isOffered(OPEN, revived), 'وبعد «أكّد التوفّر» الذي يُصفّر الموعد: أخضرُ من جديد');
}

// ── ٦ · الحارسُ الذي لولاه لظهرت شريحةُ ترقّبٍ على وقودٍ نفد ─────────────
//
// كلُّ صفٍّ لا يُعرض أخضرَ ولا رمادياً يجب أن يكون قد سقط من `isListed` —
// وإلا هبط في البطاقة إلى فرع «متوقَّع» الكهرمانيّ بلا أن يكون متوقَّعاً.
{
  const combos = [];
  for (const avail of [true, false])
    for (const u of [ago(1), ago(30), ago(60)])
      for (const r of [null, ago(1), inHours(2)])
        for (const e of [null, '2026-09-04'])
          combos.push({ is_available: avail, updated_at: u, runs_out_at: r, expected_at: e });

  for (const row of combos) {
    if (!isOffered(OPEN, row) && !isStaleOffer(row) && !row.expected_at) {
      assert.ok(!isListed(row),
        `صفٌّ لا أخضرَ فيه ولا رمادي ولا موعدَ وصول يجب ألّا يبقى معروضاً: ${JSON.stringify(row)}`);
      n++;
    }
    if (isOffered(OPEN, row)) {
      assert.ok(isListed(row), `ما هو أخضرُ يجب أن يكون معروضاً: ${JSON.stringify(row)}`);
      n++;
    }
  }
}

console.log(`✓ موعدُ النفاد — ${n} تحقّقاً`);
