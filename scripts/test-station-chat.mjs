// فحصُ القرارين اللذين يخطئان صامتَين في المحادثة.
//
//   node scripts/test-station-chat.mjs
//
// على نمط test-owner-daily.mjs: assert وحدها، بلا إطار. والمنطقُ منسوخٌ من
// components/StationChat.tsx لأن الملفّ TSX لا يُستورَد في node — وهما
// سطرانِ، ونسخُهما هنا أرخص من أداةِ ترجمةٍ في سبيل فحصٍ واحد.
import assert from 'node:assert/strict';

const STUCK_MS = 24 * 3600_000;

const isStuck = (rows, now) => {
  const last = rows.at(-1);
  if (!last || last.sender !== 'admin') return false;
  return now - Date.parse(last.created_at) > STUCK_MS;
};

const readableBy = (as, sender) => (as === 'owner' ? sender !== 'owner' : sender === 'owner');

const NOW = Date.parse('2026-08-29T12:00:00Z');
const at = (h) => new Date(NOW - h * 3600_000).toISOString();

// ── واتساب: يظهر على صمتِ إنسانٍ لا على صمتِ آلة ─────────────────────────
assert.equal(isStuck([{ sender: 'admin', created_at: at(25) }], NOW), true, 'رسالةُ إدارةٍ عمرُها 25 ساعة');
assert.equal(isStuck([{ sender: 'admin', created_at: at(23) }], NOW), false, 'دون اليوم لا شيء');

// وهذا هو سببُ كون sender ثلاثيّاً لا منطقيّاً:
assert.equal(isStuck([{ sender: 'system', created_at: at(72) }], NOW), false, 'تذكيرٌ آليٌّ لا يُلاحَق');
assert.equal(isStuck([{ sender: 'owner', created_at: at(72) }], NOW), false, 'صمتُنا نحن ليس صمتَه');
assert.equal(isStuck([], NOW), false, 'مجرًى فارغ');

// وآخرُ ما في المجرى هو الحَكَم، لا أوّلُه:
assert.equal(
  isStuck([{ sender: 'admin', created_at: at(48) }, { sender: 'owner', created_at: at(2) }], NOW),
  false,
  'ردَّ بعدها فلا ملاحقة'
);

// ── ختمُ القراءة: كلٌّ يختم ما وصله لا ما كتبه ───────────────────────────
assert.equal(readableBy('owner', 'admin'), true);
assert.equal(readableBy('owner', 'system'), true);
assert.equal(readableBy('owner', 'owner'), false, 'لا يختم المالك رسالتَه هو');
assert.equal(readableBy('admin', 'owner'), true);
assert.equal(readableBy('admin', 'admin'), false, 'ولا الإدارةُ رسالتَها هي');
assert.equal(readableBy('admin', 'system'), false, 'والآليّ ليس موجَّهاً إلى الإدارة');

// ── أيُّ تذكيرٍ يستحقّ صفّاً باقياً ──────────────────────────────────────
//
// القرارُ الذي أغرق المجرى: كُتب للجميع، فصار خمسةَ عشرَ «شكراً لالتزامك»
// من ستّةٍ وعشرين صفّاً، وغرقت تحتها ثلاثُ رسائلَ بشرية ورسالةُ اعتماد.
const THREAD_KINDS = new Set(['stale_stock', 'stale_withdrawn', 'no_stock']);

for (const k of ['stale_stock', 'stale_withdrawn', 'no_stock'])
  assert.equal(THREAD_KINDS.has(k), true, `${k} يبقى: يصف حالاً يجب إصلاحه`);
for (const k of ['closing_thanks', 'opening_first', 'opening_again', 'stock_check', 'traffic_confirm'])
  assert.equal(THREAD_KINDS.has(k), false, `${k} لا يبقى: مجاملةٌ أو سؤالٌ عن هذه اللحظة`);

// ولا يُقال ما قيل ولم يتغيّر
const wouldWrite = (base, lastKindForStation) =>
  THREAD_KINDS.has(base) && lastKindForStation !== base;
assert.equal(wouldWrite('stale_stock', null), true, 'أوّلُ مرّة يُكتب');
assert.equal(wouldWrite('stale_stock', 'stale_stock'), false, 'وتكرارُه لا يُكتب');
assert.equal(wouldWrite('stale_withdrawn', 'stale_stock'), true, 'وتغيّرُ الحال يُكتب');
assert.equal(wouldWrite('stale_stock', null), true, 'ورسالةٌ بشرية بينهما تُعيد الكتابة');

console.log('✓ محادثة المحطة: 21 فحصاً');
