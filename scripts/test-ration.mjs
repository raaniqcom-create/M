// الفرديُّ والزوجيّ — القاعدةُ كما في قرار المحافظة، حرفاً.
import assert from 'node:assert/strict';
import { dayParity, plateDigit, plateParity, shortDate, turnFor } from '../lib/ration.ts';

let n = 0;
const ok = (label, fn) => {
  fn();
  n++;
  console.log(`  ✓ ${label}`);
};

ok('١٣ فرديّ و١٤ زوجيّ — برقم اليوم', () => {
  assert.equal(dayParity('2026-09-13'), 'odd');
  assert.equal(dayParity('2026-09-14'), 'even');
  assert.equal(dayParity('2026-09-30'), 'even');
  assert.equal(dayParity('2026-10-01'), 'odd');
});
ok('آخرُ رقمٍ في اللوحة — لاتينيّاً وهنديّاً ووسطَ حروف', () => {
  assert.equal(plateDigit('12345'), 5);
  assert.equal(plateDigit('٢٣٤٥٦'), 6);
  assert.equal(plateDigit('أ 1234 بغداد 7'), 7);
  assert.equal(plateDigit('12340'), 0);
  assert.equal(plateDigit('بلا'), null);
  assert.equal(plateParity('12340'), 'even');
  assert.equal(plateParity('12341'), 'odd');
});
ok('لوحةٌ فرديّة في يومٍ فرديّ → دورُك اليوم', () => {
  const t = turnFor('12347', '2026-09-13');
  assert.equal(t.todayOk, true);
  assert.equal(t.nextOk, '2026-09-13');
  assert.equal(t.week.length, 7);
  assert.deepEqual(t.week.map((d) => d.ok), [true, false, true, false, true, false, true]);
});
ok('لوحةٌ زوجيّة في يومٍ فرديّ → دورُك غداً', () => {
  const t = turnFor('12348', '2026-09-13');
  assert.equal(t.todayOk, false);
  assert.equal(t.nextOk, '2026-09-14');
});
ok('انقلابُ الشهر: ٣٠ ثمّ ١ — الزوجيّةُ تنتظر يومين، كما يقول القرار', () => {
  const t = turnFor('12348', '2026-09-30');
  assert.deepEqual(t.week.slice(0, 3).map((d) => [d.date, d.ok]), [
    ['2026-09-30', true],
    ['2026-10-01', false],
    ['2026-10-02', true],
  ]);
});
ok('لوحةٌ بلا رقم → لا دور', () => {
  assert.equal(turnFor('بلا', '2026-09-13'), null);
});
ok('shortDate', () => {
  assert.equal(shortDate('2026-09-14'), '14/9');
});

console.log(`\n✔ ${n} تحقّقاً — القاعدةُ برقم اليوم، واللوحةُ بآخر رقم.`);
