// Station owners sign in with their phone number. Supabase auth keys on an
// email address, so the phone is normalised to a stable synthetic address.
// Normalising matters: 07901234567, 7901234567 and +9647901234567 are the same
// person, and an owner who signs up one way must be able to log in the other.
export function normalizePhone(input: string): string {
  // strip the international prefix before the country code, so 00964… and
  // +964… reduce the same way
  let digits = input.replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('964')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

export function phoneToEmail(input: string): string {
  return `p${normalizePhone(input)}@muhta.app`;
}

// Iraqi mobile numbers are 10 digits after the leading zero is dropped (7XXXXXXXXX)
export function isValidIraqiMobile(input: string): boolean {
  const n = normalizePhone(input);
  return /^7\d{9}$/.test(n);
}

export function displayPhone(input: string): string {
  const n = normalizePhone(input);
  return n ? `0${n}` : '';
}
