// حسابٌ لرقمٍ: يُنشأ بكلمةٍ جديدة، أو يُعاد إن كان موجوداً (بلا كلمة).
//
// الحساباتُ بمفتاح البريد الاصطناعيّ p<النواة>@muhta.app (lib/phone.ts:
// phoneToEmail). كان هذا مكرَّراً في station-phone وبوت تلغرام (ownerFor)؛
// وأرقامُ الورديات ثالثُ من يحتاجه فصار مشتركاً.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { newPassword } from './password.ts';

export const emailFor = (core: string) => `p${core}@muhta.app`;

/** النواةُ: 7XXXXXXXXX بلا صفرٍ ولا 964. */
export function phoneCore(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '');
}

export async function userForPhone(
  db: SupabaseClient,
  core: string
): Promise<{ id: string; password: string | null } | null> {
  const email = emailFor(core);
  const password = newPassword();
  const { data: created } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created?.user) return { id: created.user.id, password };
  // الرقمُ له حسابٌ أصلاً — يُعاد بلا كلمة؛ من أراد كلمةً يطلبها صراحةً.
  // ponytail: مسحُ صفحةٍ من ألف؛ يُستبدل ببحثٍ في auth.users حين تقترب من الألف.
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const id = list?.users?.find((u) => u.email === email)?.id ?? null;
  return id ? { id, password: null } : null;
}
