// Which reading wins, and who gets the credit.
import assert from 'node:assert';

const MINUTES = 30;
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

function activeTrafficLevel(station, votes) {
  const setAt = station.manual_traffic_set_at ? new Date(station.manual_traffic_set_at).getTime() : 0;
  const fresh = setAt > 0 && Date.now() - setAt < MINUTES * 60_000;
  const voteAt = votes?.last_vote_at ? new Date(votes.last_vote_at).getTime() : 0;
  if (fresh && station.manual_traffic_level) {
    if (voteAt > setAt && votes?.majority_level) return votes.majority_level;
    return station.manual_traffic_level;
  }
  return votes?.majority_level ?? null;
}
function trafficSource(station, votes) {
  const level = activeTrafficLevel(station, votes);
  if (!level) return null;
  const setAt = station.manual_traffic_set_at ? new Date(station.manual_traffic_set_at).getTime() : 0;
  const fresh = setAt > 0 && Date.now() - setAt < MINUTES * 60_000;
  const voteAt = votes?.last_vote_at ? new Date(votes.last_vote_at).getTime() : 0;
  return fresh && station.manual_traffic_level && voteAt <= setAt ? 'station' : 'people';
}

// the reported case: owner said متوسط, then people voted مزدحم after him
const owner = { manual_traffic_level: 'yellow', manual_traffic_set_at: ago(17) };
const crowd = { majority_level: 'red', last_vote_at: ago(2) };
assert.equal(activeTrafficLevel(owner, crowd), 'red');
assert.equal(trafficSource(owner, crowd), 'people');

// owner speaks last -> owner wins, and is credited
const later = { manual_traffic_level: 'yellow', manual_traffic_set_at: ago(1) };
assert.equal(activeTrafficLevel(later, crowd), 'yellow');
assert.equal(trafficSource(later, crowd), 'station');

// owner fresh, no votes at all
assert.equal(activeTrafficLevel(later, null), 'yellow');
assert.equal(trafficSource(later, null), 'station');

// owner expired -> crowd wins even if older than the owner's stamp
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(31) },
                                { majority_level: 'red', last_vote_at: ago(40) }), 'red');

// nothing anywhere
assert.equal(activeTrafficLevel({ manual_traffic_level: null, manual_traffic_set_at: null }, null), null);
assert.equal(trafficSource({ manual_traffic_level: null, manual_traffic_set_at: null }, null), null);

// a vote with no timestamp must not beat a fresh owner
assert.equal(activeTrafficLevel(later, { majority_level: 'red', last_vote_at: null }), 'yellow');

// 29 vs 31 minutes, the expiry edge
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(29) }, null), 'green');
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(31) }, null), null);

console.log('الازدحام: 10 حالات تمرّ — الأحدث يفوز، والنسبة تتبع الفائز');
