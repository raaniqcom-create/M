// Opening hours decide whether a driver is told fuel is collectable *now*.
// The wrap-past-midnight case is the one that silently breaks.
import assert from 'node:assert/strict';
import { timeToMinutes, isOpenNow, formatTime } from '../lib/hours.ts';

assert.equal(timeToMinutes('06:00'), 360);
assert.equal(timeToMinutes('22:30:00'), 1350);
assert.equal(formatTime('06:00:00'), '6:00 صباحاً');
assert.equal(formatTime('13:05:00'), '1:05 مساءً');
assert.equal(formatTime('00:00:00'), '12:00 صباحاً');

// isOpenNow reads the real clock, so drive the window logic directly
const openAt = (now, opens, closes) => {
  const o = timeToMinutes(opens), c = timeToMinutes(closes);
  return c > o ? now >= o && now < c : now >= o || now < c;
};

// normal daytime window 06:00-22:00
assert.ok(openAt(timeToMinutes('12:00'), '06:00', '22:00'), 'midday must be open');
assert.ok(!openAt(timeToMinutes('05:00'), '06:00', '22:00'), 'before opening must be closed');
assert.ok(!openAt(timeToMinutes('23:00'), '06:00', '22:00'), 'after closing must be closed');

// overnight window 18:00-02:00 — the one that breaks with naive comparison
assert.ok(openAt(timeToMinutes('20:00'), '18:00', '02:00'), 'evening must be open');
assert.ok(openAt(timeToMinutes('01:00'), '18:00', '02:00'), 'after midnight must still be open');
assert.ok(!openAt(timeToMinutes('03:00'), '18:00', '02:00'), 'after close must be closed');
assert.ok(!openAt(timeToMinutes('12:00'), '18:00', '02:00'), 'midday must be closed');

assert.ok(isOpenNow({ is_24h: true, opens_at: '06:00', closes_at: '07:00' }), '24h always open');

console.log('opening hours: all assertions passed');

// isoDateIn must follow BAGHDAD's calendar day — not UTC (toISOString rolls the
// day back all evening east of Greenwich) and not the reader's device either.
//
// والثاني هو الذي كان: جهازٌ على +04:00 الساعةَ 00:24 يقول 09-18 وبغدادُ تقول
// 09-17، فيُكتب «متوقّع اليوم» بيومٍ لم يبدأ بعد. رُصد حيّاً وأسقط test-list-tier.
const { isoDateIn } = await import('../lib/products.ts');
const baghdadDay = (offset) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
assert.equal(isoDateIn(0), baghdadDay(0), 'today must be Baghdad’s day, not the device’s');
assert.equal(isoDateIn(1), baghdadDay(1), 'tomorrow must be Baghdad’s day');
assert.notEqual(isoDateIn(1), isoDateIn(0), 'tomorrow must differ from today');
console.log('expected-date helper: assertions passed');

// 12-hour picker conversion: midnight and noon are where this usually breaks.
const { to24Hour } = await import('../lib/hours.ts');
assert.equal(to24Hour(12, '00', true), '00:00', '12 صباحاً = midnight');
assert.equal(to24Hour(12, '30', false), '12:30', '12 مساءً = noon');
assert.equal(to24Hour(1, '00', true), '01:00');
assert.equal(to24Hour(11, '45', true), '11:45');
assert.equal(to24Hour(1, '00', false), '13:00');
assert.equal(to24Hour(11, '00', false), '23:00');

// every clock time must survive select -> store -> display unchanged
for (let h = 0; h < 24; h++) {
  const stored = `${String(h).padStart(2, '0')}:15`;
  const shown = formatTime(stored);
  const [hh, rest] = shown.split(':');
  const morning = rest.includes('صباحاً');
  assert.equal(to24Hour(Number(hh), '15', morning), stored, `round trip failed for ${stored}`);
}
console.log('12-hour conversion: assertions passed');

// ── ساعةُ الحائط ← لحظةُ النفاد ─────────────────────────────────────────────
//
// «افعل الآن، اطفئه الساعة 8:00». والمحلِّلُ يُستورد حقيقيّاً لا يُحاكى: كلُّ
// عطبٍ محتملٍ فيه في المنطقة الزمنيّة، ومحاكاتُه تُوافق نفسَها ولا تُثبت شيئاً.
const { runsOutFromClock, baghdadClock, runsOutLabel } = await import('../lib/hours.ts');

// لحظةٌ ثابتة: 09:00Z = الثانيةَ عشرةَ ظهراً ببغداد
const NOON = Date.parse('2026-09-17T09:00:00Z');

assert.equal(runsOutFromClock('18:00', NOON), '2026-09-17T15:00:00.000Z', 'ساعةٌ لم تأتِ → اليومَ');
assert.equal(runsOutFromClock('08:00', NOON), '2026-09-18T05:00:00.000Z', 'ساعةٌ مضت → غداً');
// والحدُّ نفسُه: الساعةُ الحاليّةُ بالضبط ليست موعداً، فتُقرأ غداً
assert.equal(runsOutFromClock('12:00', NOON), '2026-09-18T09:00:00.000Z', 'الآنَ بالضبط → غداً');
assert.equal(runsOutFromClock('12:01', NOON), '2026-09-17T09:01:00.000Z', 'ودقيقةٌ بعدها اليومَ');

// ولا موعدَ يتجاوز أربعاً وعشرين ساعة — سقفُ FRESH_HOURS نفسُه، فلا يشيخ الخبرُ
// قبل الموعد الذي يحمله.
for (const hh of ['00:00', '05:30', '12:00', '23:59']) {
  const d = Date.parse(runsOutFromClock(hh, NOON)) - NOON;
  assert.ok(d > 0 && d <= 24 * 3600_000, `${hh} خارج النافذة`);
}

// ولا تحويلَ صيفيّ في العراق: كانونُ الثاني وتمّوزُ على +03:00 سواءً. لو تسلّل
// حسابُ إزاحةٍ محليّةٍ لانحرف أحدُهما ساعةً عن أخيه.
assert.equal(runsOutFromClock('08:00', Date.parse('2026-01-10T04:00:00Z')), '2026-01-10T05:00:00.000Z');
assert.equal(runsOutFromClock('08:00', Date.parse('2026-07-10T04:00:00Z')), '2026-07-10T05:00:00.000Z');

// وما لا يُقرأ ساعةً لا يُكتب موعداً
assert.equal(runsOutFromClock('', NOON), null);
assert.equal(runsOutFromClock('8:00', NOON), null, 'ساعةٌ بخانةٍ واحدة ليست ISO');

// ذهاباً وإياباً: ما تكتبه الساعةُ تقرؤه الساعة — وإلّا كذب الحقلُ على مالئه
assert.equal(baghdadClock(runsOutFromClock('06:45', NOON)), '06:45');
// ومنتصفُ الليل "00:00" لا "24:00" — 21:00Z هو منتصفُ ليل بغداد
assert.equal(baghdadClock('2026-09-17T21:00:00.000Z'), '00:00');

// و«غداً» تُقال لغدٍ وحدَه — وإلّا قرأ السائقُ موعدَ أمسِ موعدَ غد
assert.ok(runsOutLabel(new Date(Date.now() + 86_400_000).toISOString()).endsWith('غداً'));
assert.ok(!runsOutLabel(new Date(Date.now() - 3600_000).toISOString()).endsWith('غداً'), 'وما مضى ليس غداً');
assert.ok(!/[٠-٩]/.test(runsOutLabel(new Date(Date.now() + 3600_000).toISOString())), 'أرقامٌ لاتينيّة');
console.log('run-out wall clock: assertions passed');
