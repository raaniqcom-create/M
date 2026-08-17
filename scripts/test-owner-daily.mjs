// Which of the three messages is due, and when. The window logic is the part
// that silently misfires: too narrow and a message is skipped forever, too
// wide and it repeats.
import assert from 'node:assert';

const WINDOW_MIN = 20;
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const justPassed = (moment, now) => ((now - moment + 1440) % 1440) < WINDOW_MIN;

function decide(station, now, lastUpdateDay, today) {
  const open = station.is_24h ? 420 : toMinutes(station.opens_at);
  const close = station.is_24h ? 1260 : toMinutes(station.closes_at);
  const publishedToday = lastUpdateDay === today;
  const everPublished = lastUpdateDay !== null;
  if (justPassed(open, now) && !publishedToday) return everPublished ? 'opening_again' : 'opening_first';
  if (justPassed(close, now) && publishedToday) return 'closing_thanks';
  return null;
}

const S = { is_24h: false, opens_at: '06:00:00', closes_at: '22:00:00' };
const TODAY = '2026-08-17';

// 1. registered, never published -> welcome at opening
assert.equal(decide(S, toMinutes('06:05'), null, TODAY), 'opening_first');
// 2. published before but not today -> good morning at opening
assert.equal(decide(S, toMinutes('06:05'), '2026-08-16', TODAY), 'opening_again');
// 3. published today -> thanks at closing
assert.equal(decide(S, toMinutes('22:10'), TODAY, TODAY), 'closing_thanks');

// a station that published today is NOT nagged at opening
assert.equal(decide(S, toMinutes('06:05'), TODAY, TODAY), null);
// one that did not publish gets no thanks at closing — silence, not a scolding
assert.equal(decide(S, toMinutes('22:10'), '2026-08-16', TODAY), null);
// nothing fires in the middle of the day
assert.equal(decide(S, toMinutes('13:00'), TODAY, TODAY), null);

// window edges: 19 minutes late still fires, 21 does not
assert.equal(decide(S, toMinutes('06:19'), null, TODAY), 'opening_first');
assert.equal(decide(S, toMinutes('06:21'), null, TODAY), null);

// a station open past midnight must not wrap into the wrong window
const night = { is_24h: false, opens_at: '20:00:00', closes_at: '04:00:00' };
assert.equal(decide(night, toMinutes('20:05'), null, TODAY), 'opening_first');
assert.equal(decide(night, toMinutes('04:05'), TODAY, TODAY), 'closing_thanks');
assert.equal(decide(night, toMinutes('12:00'), TODAY, TODAY), null);

// 24h stations are judged at 07:00 and 21:00
const always = { is_24h: true, opens_at: '00:00:00', closes_at: '00:00:00' };
assert.equal(decide(always, toMinutes('07:05'), null, TODAY), 'opening_first');
assert.equal(decide(always, toMinutes('21:05'), TODAY, TODAY), 'closing_thanks');

console.log('تذكير المحطات: 13 حالة تمرّ');
