// One check for the phone normaliser: an owner who signs up with 07XX must be
// able to log in with +964 7XX and vice versa, or they lose their account.
import assert from 'node:assert/strict';
import { normalizePhone, phoneToEmail, isValidIraqiMobile, displayPhone } from '../lib/phone.ts';

const same = ['07901234567', '7901234567', '+9647901234567', '009647901234567', '0790 123 4567'];
const emails = new Set(same.map(phoneToEmail));
assert.equal(emails.size, 1, `all formats must map to one login, got ${[...emails].join(', ')}`);
assert.equal(normalizePhone('07901234567'), '7901234567');
assert.equal(displayPhone('+9647901234567'), '07901234567');

assert.ok(isValidIraqiMobile('07901234567'));
assert.ok(isValidIraqiMobile('+9647701234567'));
assert.ok(!isValidIraqiMobile('0790123456'), 'too short must fail');
assert.ok(!isValidIraqiMobile('01234567890'), 'non-mobile prefix must fail');
assert.ok(!isValidIraqiMobile(''), 'empty must fail');

console.log('phone normalisation: all assertions passed');
