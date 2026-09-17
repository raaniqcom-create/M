// سجلُّ التحديثات: من فعل وماذا — دوالُّ lib/updates.ts الصرفة.
//   node scripts/test-updates.mjs
import assert from 'node:assert/strict';
import { actorName, describeChange } from '../lib/updates.ts';

const managers = [{ user_id: 'm1', phone: '07811111111', username: null, label: 'الوردية الليلية', active: true },
                  { user_id: 'm2', phone: null, username: 'ahmed_pm', label: null, active: false }];
assert.equal(actorName(null, 'o', '07900000000', managers), 'النظام');
assert.equal(actorName('o', 'o', '07900000000', managers), 'الأساسي 07900000000');
assert.equal(actorName('m1', 'o', '07900000000', managers), 'الوردية الليلية 07811111111');
assert.equal(actorName('m2', 'o', '07900000000', managers), 'موظّف ahmed_pm');
assert.equal(actorName('x', 'o', '07900000000', managers), 'الإدارة');

assert.equal(describeChange('gasoline_regular', { is_available: true }), 'بانزين عادي → متوفّر');
assert.equal(describeChange('kerosene', { is_available: false }), 'كاز → غير متوفّر');
assert.equal(describeChange(null, { confirm: true }), 'أكّد التوفّر');
assert.equal(describeChange('gasoline_regular', { runs_out_at: null }), 'بانزين عادي: أُلغي موعد النفاد');
// وموعدٌ نسبيٌّ لا ثابت: تاريخٌ مكتوبٌ باليد يشيخ فيصير «غداً» يوماً ثمّ لا يصير.
// والسجلُّ كان وحدَه في المنصّة يكتب الساعةَ بأرقامٍ هنديّة — فيُشهَد عليه هنا.
const ranOut = describeChange('gasoline_regular', {
  runs_out_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
});
assert.match(ranOut, /^بانزين عادي: ينفد \d{1,2}:\d{2} (صباحاً|مساءً)$/);
assert.ok(!/[٠-٩]/.test(ranOut), 'أرقامٌ لاتينيّة في السجلّ');
assert.equal(describeChange('gasoline_premium', { traffic_level: 'red' }), 'بانزين محسن: الازدحام مزدحم');
assert.equal(describeChange('gasoline_premium', { traffic_level: null }), 'بانزين محسن: مُسح الازدحام');
assert.equal(describeChange('kerosene', { expected_at: null }), 'كاز: أُلغي موعد الوصول');
assert.equal(describeChange('kerosene', { expected_at: '2026-09-17', expected_period: 'morning' }), 'كاز: موعد الوصول 2026-09-17 الصباح');
assert.equal(describeChange(null, { temp_closed: true }), 'إغلاق مؤقّت');
assert.equal(describeChange(null, { temp_closed: false }), 'فتحُ المحطة');
assert.equal(describeChange(null, { manual_traffic_level: 'green' }), 'ازدحام المحطة: خفيف');
assert.equal(describeChange('gas', { is_available: true, traffic_level: 'yellow' }), 'غاز → متوفّر · غاز: الازدحام متوسط');
console.log('18 فحصاً — كلُّها سليمة.');
