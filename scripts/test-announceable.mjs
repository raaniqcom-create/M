// ما يستحقّ إشعاراً حين يُرسل المالكُ تحديثَه — وما لا يستحقّ.
//
// طلبُ صاحب المنصّة ١١ أيلول ٢٠٢٦: «في حال كان متوقّع أو متوفر أرسل إشعاراً،
// في حال كان غير متوفر لا ترسل إشعاراً فقط تحديث الحالة». والفخُّ الوحيد:
// وعدٌ فات موعدُه ليس وعداً — «متوقّع» في الثامن والعشرين من آب يُقرأ في
// أيلول «قادم»، وإشعارٌ به يُرسل الناسَ إلى لا شيء.
import assert from 'node:assert/strict';
import { isAnnounceable } from '../lib/products.ts';

const today = new Date();
const iso = (days) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const cases = [
  ['متوفر', { is_available: true }, true],
  ['متوفر ومعه وعدٌ قديم (وصل ✓)', { is_available: true, expected_at: iso(-3) }, true],
  ['متوقّع غداً', { is_available: false, expected_at: iso(1) }, true],
  ['متوقّع اليوم', { is_available: false, expected_at: iso(0) }, true],
  ['متوقّع فائت', { is_available: false, expected_at: iso(-1) }, false],
  ['غير متوفر', { is_available: false, expected_at: null }, false],
  ['صفٌّ مفقود', undefined, false],
  ['صفٌّ فارغ', null, false],
];

for (const [name, row, want] of cases) {
  assert.equal(isAnnounceable(row), want, name);
}
console.log(`✓ isAnnounceable — ${cases.length} حالات`);
