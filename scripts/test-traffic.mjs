// The 30-minute expiry, checked at the boundaries rather than trusted.
import assert from 'node:assert';

const MANUAL_TRAFFIC_MINUTES = 30;
function activeTrafficLevel(station, votes) {
  const setAt = station.manual_traffic_set_at ? new Date(station.manual_traffic_set_at).getTime() : 0;
  const stillFresh = setAt > 0 && Date.now() - setAt < MANUAL_TRAFFIC_MINUTES * 60_000;
  if (stillFresh && station.manual_traffic_level) return station.manual_traffic_level;
  return votes?.majority_level ?? null;
}
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

// fresh owner reading wins over votes
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(5) }, { majority_level: 'red' }), 'green');
// at 29 minutes it still holds
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(29) }, null), 'green');
// at 31 it is gone, and votes take over
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(31) }, { majority_level: 'red' }), 'red');
// expired with no votes shows nothing at all
assert.equal(activeTrafficLevel({ manual_traffic_level: 'green', manual_traffic_set_at: ago(31) }, null), null);
// cleared by the owner falls straight through to votes
assert.equal(activeTrafficLevel({ manual_traffic_level: null, manual_traffic_set_at: ago(1) }, { majority_level: 'yellow' }), 'yellow');
// a missing timestamp must not be treated as "just now"
assert.equal(activeTrafficLevel({ manual_traffic_level: 'red', manual_traffic_set_at: null }, null), null);

console.log('انتهاء صلاحية الازدحام: ٦ حالات تمرّ');
