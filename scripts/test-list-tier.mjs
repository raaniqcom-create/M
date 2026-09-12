// طبقاتُ القائمة الرئيسية: الآن · متوقّع · الباقي.
//   node scripts/test-list-tier.mjs
import assert from 'node:assert/strict';
import { listTier } from '../lib/products.ts';

const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const day = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
const station = (products, extra = {}) => ({
  is_24h: true,
  opens_at: '00:00:00',
  closes_at: '23:59:00',
  temp_closed: false,
  products,
  ...extra,
});
const now = (product) => ({ product, is_available: true, updated_at: iso(1), runs_out_at: null, expected_at: null });
const soon = (product, plusDays) => ({ product, is_available: false, updated_at: iso(1), runs_out_at: null, expected_at: day(plusDays) });

const cases = [
  ['متوفّرٌ طازج → now', station([now('kerosene')]), null, 'now'],
  ['مغلقةٌ مؤقّتاً ولو بإعلانٍ طازج → rest', station([now('kerosene')], { temp_closed: true }), null, 'rest'],
  ['مغلقةٌ الآن بالدوام → rest', station([now('kerosene')], { is_24h: false, opens_at: '00:00:00', closes_at: '00:01:00' }), null, 'rest'],
  ['خبرٌ عمرُه 30 ساعة → rest', station([{ ...now('kerosene'), updated_at: iso(30) }]), null, 'rest'],
  ['نفد → rest', station([{ ...now('kerosene'), runs_out_at: iso(1) }]), null, 'rest'],
  ['متوقّعٌ غداً → expected', station([soon('gasoline_regular', 1)]), null, 'expected'],
  ['متوقّعٌ اليوم → expected', station([soon('gasoline_regular', 0)]), null, 'expected'],
  ['وعدٌ فائت → rest', station([soon('gasoline_regular', -1)]), null, 'rest'],
  ['كاز الآن + عاديّ غداً، بلا تصفية → now', station([now('kerosene'), soon('gasoline_regular', 1)]), null, 'now'],
  ['… بتصفية «عادي» → expected', station([now('kerosene'), soon('gasoline_regular', 1)]), 'gasoline_regular', 'expected'],
  ['… بتصفية «كاز» → now', station([now('kerosene'), soon('gasoline_regular', 1)]), 'kerosene', 'now'],
  ['بلا منتجات → rest', station([]), null, 'rest'],
];

for (const [name, st, product, want] of cases) {
  assert.equal(listTier(st, product), want, name);
}
console.log(`✓ listTier — ${cases.length} حالة`);
