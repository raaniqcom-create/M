// «غسيل»: بوتُ «محطة الغسل» — رموزُ الأزرار، الأقربُ، الأيّامُ، لوحاتُ المفاتيح — دوالُّ _shared/washBot.ts الصرفة.
//   node scripts/test-wash-bot.mjs
import assert from 'node:assert/strict';
import { nextStatuses } from '../lib/wash.ts';
import { ST, ST_CODE, bookingLine, cb, cityButtons, distKm, nearest, openDays, ownerButtons, parseCb, rows, starButtons } from '../supabase/functions/_shared/washBot.ts';

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log(`  ✓ ${label}`); };
const bare = (v) => v.replace(/[⁦⁩‏]/g, '');
const UUID = '0b6a3d1e-4c2f-4a5b-9c8d-7e6f5a4b3c2d';

ok('الرمزُ ≤ ٦٤ بايتاً، ويرمي فوقها', () => {
  const s = cb('st', 'no', UUID);
  assert.equal(s, `w:st:no:${UUID}`);
  assert.ok(new TextEncoder().encode(s).length <= 64);
  assert.throws(() => cb('x', 'ي'.repeat(40)), /64/);
});
ok('parseCb ذهاباً وإياباً، ولا شيءَ لغير w:', () => {
  assert.deepEqual(parseCb(cb('c', 12)), ['c', '12']);
  assert.deepEqual(parseCb(cb('r', '482113', 5)), ['r', '482113', '5']);
  assert.deepEqual(parseCb(cb('t', '10:30')).slice(1).join(':'), '10:30');
  assert.equal(parseCb('menu'), null);
});
ok('ST/ST_CODE يغطّيان كلَّ انتقالٍ تسمح به القاعدة', () => {
  for (const from of ['pending', 'confirmed', 'arrived', 'in_service']) {
    for (const s of nextStatuses(from)) {
      assert.ok(ST_CODE[s], `${s} بلا رمز`);
      assert.equal(ST[ST_CODE[s]], s);
    }
  }
});
ok('أزرارُ المالك: المعلّقُ تأكيدٌ وإلغاءٌ فقط، وقيدُ الغسل «تمّت» وحدَها', () => {
  const p = ownerButtons({ id: UUID, status: 'pending' }).inline_keyboard.flat();
  assert.deepEqual(p.map((b) => b.text), ['تأكيد', 'إلغاء']);
  assert.deepEqual(p.map((b) => b.callback_data), [`w:st:ok:${UUID}`, `w:st:no:${UUID}`]);
  const i = ownerButtons({ id: UUID, status: 'in_service' }).inline_keyboard.flat();
  assert.deepEqual(i.map((b) => b.text), ['تمّت']);
  assert.deepEqual(ownerButtons({ id: UUID, status: 'completed' }).inline_keyboard, []);
});
ok('الأقرب: يُسقط ما فوق ٣٠ كم ويرتّب تصاعديّاً (الرمادي↔الفلوجة ≈ ٤٦ كم)', () => {
  const ramadi = { lat: 33.4258, lng: 43.3012 }, fallujah = { lat: 33.3556, lng: 43.7864 };
  const d = distKm(ramadi.lat, ramadi.lng, fallujah.lat, fallujah.lng);
  assert.ok(d > 44 && d < 48, `${d}`);
  const rowsIn = [
    { name: 'ف', ...fallujah },
    { name: 'خ', lat: 33.3789, lng: 43.4881 },
    { name: 'ر', lat: 33.43, lng: 43.31 },
  ];
  const near = nearest(rowsIn, ramadi.lat, ramadi.lng);
  assert.deepEqual(near.map((w) => w.name), ['ر', 'خ']);
  assert.ok(near[0].km < near[1].km);
  assert.equal(nearest(rowsIn, ramadi.lat, ramadi.lng, 100, 1).length, 1);
});
ok('أيّامُ الحجز: اليومَ والغدَ ببغداد، والشهرُ ينقلب', () => {
  assert.deepEqual(openDays(1, Date.parse('2026-09-17T09:00:00Z')), ['2026-09-17', '2026-09-18']);
  assert.deepEqual(openDays(1, Date.parse('2026-09-30T20:00:00Z')), ['2026-09-30', '2026-10-01']);
  assert.deepEqual(openDays(0, Date.parse('2026-09-30T21:30:00Z')), ['2026-10-01'], '٢١:٣٠ عالميّاً = بعد منتصف ليل بغداد');
});
ok('خمسُ نجومٍ تُقرأ رجوعاً', () => {
  const kb = starButtons('482113').inline_keyboard;
  assert.equal(kb.length, 1); assert.equal(kb[0].length, 5);
  kb[0].forEach((b, i) => assert.deepEqual(parseCb(b.callback_data), ['r', '482113', String(i + 1)]));
});
ok('الصفوفُ والمدنُ بفهرسها', () => {
  assert.deepEqual(rows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const kb = cityButtons(['الفلوجة', 'الرمادي', 'مدينةٌ مجهولة']).inline_keyboard.flat();
  assert.deepEqual(kb.map((b) => b.text), ['الرمادي', 'الفلوجة'], 'ترتيبُ ANBAR_CITIES لا ترتيبُ الإدخال');
  assert.deepEqual(kb.map((b) => b.callback_data), ['w:c:0', 'w:c:1']);
});
ok('سطرُ الحجز يُهرّب الوسومَ ويقرأ اليومَ ببغداد', () => {
  const now = Date.parse('2026-09-17T09:00:00Z');
  const s = bookingLine({ wash: 'مغسلة <النور>', service_name: 'غسيل خارجي', starts_at: '2026-09-17T13:00:00Z', code: '482113', status: 'confirmed' }, now);
  assert.match(s, /^<b>مغسلة &lt;النور&gt;<\/b> · غسيل خارجي\n/);
  assert.match(bare(s), /اليوم 4:00 PM · #482113 · مؤكَّد$/);
});

console.log(`\n${n} فحوصٍ مرّت.`);
