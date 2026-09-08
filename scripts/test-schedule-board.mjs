// يفحص لوحةَ الجدول: مصدران، ودمجٌ، وترتيبٌ، وحالةٌ حيّة.
//
//   node scripts/test-schedule-board.mjs
//
// الجدولُ صار يقرأ مصدرين: ما يُنشر من تلغرام، وما تعلنه محطاتُ المنصّة في
// لوحاتها (`station_products.expected_at`). وأخطرُ ما فيه ثلاثة:
//
//   ١ ـ **التكرار.** «غصن الزيتون» وردت في جدول القناة غيرَ مربوطة، وهي
//       نفسُها أعلنت توقّعاً من لوحتها — حالةٌ حيّةٌ في القاعدة يومَ كُتب هذا.
//       فلو ظهرت مرّتين لَقرأ المواطنُ محطةً واحدةً محطّتين.
//   ٢ ـ **الحالة.** وعدٌ يصير «وصل» بضغطةٍ من صاحبه، وينفد فيبقى مكتوباً
//       عليه «نفد» ولا يُمحى — قرارُ صاحب المنصّة.
//   ٣ ـ **الوعدُ الفائت.** في القاعدة وعودٌ من آب لم تُنظَّف، و`isListed`
//       تُبقيها إلى الأبد. فاللوحةُ تأخذ يومَها وحدَه.
import assert from 'node:assert/strict';
import { buildBoard, groupBoard, baghdadDate } from '../lib/board.ts';

let n = 0;
const ok = (label, fn) => {
  fn();
  n++;
  console.log(`  ✓ ${label}`);
};

const DAY = baghdadDate();
const OLD = baghdadDate(-30);
const now = new Date().toISOString();

// محطةٌ مفتوحةٌ أربعاً وعشرين ساعة، فـ`isOpenNow` لا تُدخل الساعةَ في الحكم.
const station = (id, name, city, products) => ({
  id,
  name,
  city,
  is_24h: true,
  opens_at: '00:00:00',
  closes_at: '00:00:00',
  temp_closed: false,
  products,
  traffic: null,
  productTraffic: [],
});

const prod = (product, extra = {}) => ({
  station_id: 'x',
  product,
  is_available: false,
  expected_at: null,
  expected_period: null,
  runs_out_at: null,
  updated_at: now,
  ...extra,
});

const chan = (id, station_name, city, product, extra = {}) => ({
  id,
  for_date: DAY,
  product,
  batch_id: 'b',
  raw_name: station_name,
  station_name,
  city,
  linked_station_id: null,
  note: null,
  ...extra,
});

// ــ ١ ـ المصدران يجتمعان ــــــــــــــــــــــــــــــــــــــــــــــــــــ
console.log('المصدران:');
ok('لوحةُ المحطة تدخل الجدولَ بلا تلغرام', () => {
  const rows = buildBoard(
    [],
    [
      station('S1', 'محطة الأمل', 'الرمادي', [
        prod('gasoline_regular', { expected_at: DAY, expected_period: 'morning' }),
      ]),
    ],
    DAY
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'station');
  assert.equal(rows[0].state, 'expected');
  assert.equal(rows[0].period, 'morning');
  assert.equal(rows[0].stationId, 'S1');
});

ok('ووعدٌ لغير يومِ اللوحة لا يدخل', () => {
  const rows = buildBoard(
    [],
    [station('S1', 'محطة الأمل', 'الرمادي', [prod('gasoline_regular', { expected_at: OLD })])],
    DAY
  );
  assert.equal(rows.length, 0, 'وعدُ آبَ لا يُعرض في جدول اليوم');
});

// ــ ٢ ـ الحالةُ الحيّة ــــــــــــــــــــــــــــــــــــــــــــــــــــــ
console.log('الحالة:');
ok('التفعيلُ يقلب الوعدَ «وصل»', () => {
  const rows = buildBoard(
    [],
    [
      station('S1', 'محطة الأمل', 'الرمادي', [
        prod('gasoline_regular', { expected_at: DAY, is_available: true }),
      ]),
    ],
    DAY
  );
  assert.equal(rows[0].state, 'arrived');
});

ok('والنفادُ المعلَن يُبقي السطرَ ولا يمحوه', () => {
  const rows = buildBoard(
    [],
    [
      station('S1', 'محطة الأمل', 'الرمادي', [
        prod('gasoline_regular', {
          expected_at: DAY,
          is_available: true,
          runs_out_at: new Date(Date.now() - 3600_000).toISOString(),
        }),
      ]),
    ],
    DAY
  );
  assert.equal(rows.length, 1, 'لا يُمحى — فمن قرأ الجدولَ صباحاً يعرف لماذا اختفت');
  assert.equal(rows[0].state, 'out');
});

// ولا تُستنتج «نفد» من الإطفاء وحدَه: وعدٌ لم يصل بعدُ مطفأٌ أيضاً.
ok('والإطفاءُ بلا موعدِ نفادٍ يبقى «متوقّع»', () => {
  const rows = buildBoard(
    [],
    [
      station('S1', 'محطة الأمل', 'الرمادي', [
        prod('gasoline_regular', { expected_at: DAY, is_available: false }),
      ]),
    ],
    DAY
  );
  assert.equal(rows[0].state, 'expected', 'وعدٌ لم يصل ليس نفاداً');
});

// ــ ٣ ـ التكرارُ يُدمج، ولوحةُ المحطة تغلب ــــــــــــــــــــــــــــــــ
console.log('الدمج:');
ok('بالاسم والمنطقة — ولو لم يكن مربوطاً', () => {
  const rows = buildBoard(
    [chan('c1', 'محطة غصن الزيتون', 'حصيبة الشرقية', 'gasoline_regular')],
    [
      station('S9', 'محطة تعبئة وقود غصن الزيتون', 'حصيبة الشرقية', [
        prod('gasoline_regular', { expected_at: DAY, expected_period: 'morning' }),
      ]),
    ],
    DAY
  );
  assert.equal(rows.length, 1, 'محطةٌ واحدةٌ لا محطّتان');
  assert.equal(rows[0].source, 'station', 'لوحةُ المحطة تغلب — لأنّها أدقّ');
  assert.equal(rows[0].alsoInChannel, true, 'ويُقال إنّه ورد في الجدول المنشور');
  assert.equal(rows[0].period, 'morning', 'والفترةُ من اللوحة لا تضيع');
});

// الحالةُ الحقيقيّة: القناةُ تكتب «غصن الزيتون جويبة» والمنصّةُ تسجّلها
// «محطة تعبئة وقود غصن الزيتون». والتطبيعُ يُسقط «محطة/تعبئة/وقود» فيبقى
// الأقصرُ داخلَ الأطول لا مساوياً له.
ok('بالاحتواء لا بالتطابق — الحالةُ الحيّة', () => {
  const rows = buildBoard(
    [chan('c1', 'غصن الزيتون جويبة', 'حصيبة الشرقية', 'gasoline_regular')],
    [
      station('S9', 'محطة تعبئة وقود غصن الزيتون', 'حصيبة الشرقية', [
        prod('gasoline_regular', { expected_at: DAY }),
      ]),
    ],
    DAY
  );
  assert.equal(rows.length, 1, 'محطةٌ واحدةٌ لا محطّتان');
  assert.equal(rows[0].source, 'station');
  assert.equal(rows[0].alsoInChannel, true);
});

// ولا يبتلع القصيرُ الطويلَ بحرفين: «الحق» ليست «الحقلانية».
ok('واسمٌ قصيرٌ لا يبتلع غيرَه', () => {
  const rows = buildBoard(
    [chan('c1', 'الحق', 'الرمادي', 'gasoline_regular')],
    [station('S1', 'محطة الحقلانية', 'الرمادي', [prod('gasoline_regular', { expected_at: DAY })])],
    DAY
  );
  assert.equal(rows.length, 2, 'اسمان مختلفان');
});

ok('وبالمعرّف حين يكون الصفُّ مربوطاً', () => {
  const rows = buildBoard(
    [chan('c1', 'اسمٌ آخرُ تماماً', 'الرمادي', 'kerosene', { linked_station_id: 'S1' })],
    [station('S1', 'محطة الأمل', 'الرمادي', [prod('kerosene', { expected_at: DAY })])],
    DAY
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'محطة الأمل');
  assert.equal(rows[0].alsoInChannel, true);
});

ok('ومنتجان مختلفان لا يُدمجان', () => {
  const rows = buildBoard(
    [chan('c1', 'محطة الأمل', 'الرمادي', 'kerosene')],
    [station('S1', 'محطة الأمل', 'الرمادي', [prod('gasoline_regular', { expected_at: DAY })])],
    DAY
  );
  assert.equal(rows.length, 2, 'الكازُ غيرُ البانزين ولو في المحطة نفسِها');
});

// ــ ٤ ـ الترتيب ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
console.log('الترتيب:');
ok('محطاتُ المنصّة أوّلاً، ثمّ ما وصل قبل ما يُنتظر قبل ما نفد', () => {
  const rows = buildBoard(
    [chan('c1', 'محطة القناة', 'الرمادي', 'gasoline_regular')],
    [
      station('S1', 'محطة النافدة', 'الرمادي', [
        prod('gasoline_regular', {
          expected_at: DAY,
          is_available: true,
          runs_out_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ]),
      station('S2', 'محطة الواصلة', 'الرمادي', [
        prod('gasoline_regular', { expected_at: DAY, is_available: true }),
      ]),
      station('S3', 'محطة المنتظرة', 'الرمادي', [prod('gasoline_regular', { expected_at: DAY })]),
    ],
    DAY
  );
  const g = groupBoard(rows)[0];
  assert.deepEqual(
    g.rows.map((r) => r.name),
    ['محطة الواصلة', 'محطة المنتظرة', 'محطة النافدة', 'محطة القناة']
  );
});

ok('والمنطقةُ المجهولةُ آخرَ المجموعات', () => {
  const rows = buildBoard(
    [
      chan('c1', 'بلا منطقة', null, 'gasoline_regular'),
      chan('c2', 'في الرمادي', 'الرمادي', 'gasoline_regular'),
    ],
    [],
    DAY
  );
  const gs = groupBoard(rows);
  assert.equal(gs[0].city, 'الرمادي');
  assert.equal(gs[gs.length - 1].city, null);
});

console.log(`${n} فحصاً — كلُّها سليمة.`);
