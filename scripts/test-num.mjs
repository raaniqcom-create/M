// يفحص فاصلةَ الأرقام — والمقصودُ منها القراءةُ بلمحة لا الزينة.
//
//   node scripts/test-num.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { num } from '../lib/num.ts';

assert.equal(num(125273), '125,273');
assert.equal(num(9838), '9,838');
assert.equal(num(999), '999', 'دون الألف لا فاصلة');
assert.equal(num(0), '0', 'وصفرٌ رقمٌ لا فراغ');
assert.equal(num(1000), '1,000');

// وما ليس رقماً لا يُعرض صفراً: صفرٌ يُقرأ خبراً وهو ليس خبراً
assert.equal(num(null), '—');
assert.equal(num(undefined), '—');
assert.equal(num(NaN), '—');
assert.equal(num(Infinity), '—');

// وأرقامٌ لاتينيّة لا هنديّة — المنصّةُ كلُّها كذلك، ونظامان في شاشةٍ واحدة عطل
assert.ok(!/[٠-٩]/.test(num(125273)), 'الأرقامُ لاتينيّة');

// ولا نسخةَ ثانيةً في المكوّنات: تعريفٌ واحدٌ لا يتفرّق
const files = [
  'components/AdminStats.tsx', 'components/AdminHealth.tsx',
  'components/AudienceBanner.tsx', 'components/BottomDock.tsx',
  'components/OwnerMessagePreview.tsx',
];
for (const f of files) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert.ok(
    !src.includes("toLocaleString('en-US')"),
    `${f} ينسّق بنفسه — يُوحَّد على lib/num.ts`
  );
}

console.log('numbers: all assertions passed');
