// الإيقافُ بسبب عدم النشر: ٧٢ ساعةً بلا لمسةٍ على المنتجات.
//   node scripts/test-silence.mjs
import assert from 'node:assert/strict';
import { SILENCE_HOURS, isSuspended, lastPublished, silentFor, silentHours } from '../lib/silence.ts';

const now = Date.parse('2026-09-15T12:00:00Z');
const h = (n) => new Date(now - n * 3_600_000).toISOString();
const st = (...ups) => ({ products: ups.map((u) => ({ updated_at: u })) });

assert.equal(SILENCE_HOURS, 72);
assert.equal(lastPublished(st(h(100), h(5), null)), h(5), 'أحدثُ لمسة');
assert.equal(lastPublished(st(null, null)), null);
assert.ok(!isSuspended(st(h(71.9)), now), 'دون ٧٢ ساعة ناشرة');
assert.ok(isSuspended(st(h(72.1)), now), 'فوق ٧٢ ساعة موقوفة');
assert.ok(isSuspended(st(), now), 'لم تنشر قطّ');
assert.ok(!isSuspended({ is_demo: true, products: [] }, now), 'التجريبيّةُ لا تُوقَف');
assert.ok(!isSuspended(st(h(100), h(1)), now), 'صفٌّ واحدٌ طازج يكفي');
assert.equal(silentHours(st(h(80)), now), 80);
assert.equal(silentFor(st(h(80)), now), 'منذ 3 أيام');
assert.equal(silentFor(st(h(73)), now), 'منذ 3 أيام', 'بالأيّام الكاملة');
assert.equal(silentFor(st(h(24 * 12)), now), 'منذ 12 يوماً');
assert.equal(silentFor(st(), now), 'منذ التسجيل');
console.log('12 فحصاً — كلُّها سليمة.');
