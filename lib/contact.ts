/** A station listed from the public fuel directory has a real name and a real
 *  address, but no published phone. Rather than invent one — a driver would
 *  call a stranger — those rows carry a non-dialable placeholder, and every
 *  surface asks here before offering a call button. */
export function isDialable(phone: string | null | undefined): boolean {
  return /^07\d{9}$/.test((phone ?? '').replace(/\D/g, ''));
}
