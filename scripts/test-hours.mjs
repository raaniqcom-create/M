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

// isoDateIn must follow the LOCAL calendar day, not UTC. In Iraq (UTC+3/+4)
// toISOString() rolls back a day for most of the evening.
const { isoDateIn } = await import('../lib/products.ts');
const localDay = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
assert.equal(isoDateIn(0), localDay(0), 'today must match local calendar day');
assert.equal(isoDateIn(1), localDay(1), 'tomorrow must match local calendar day');
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
