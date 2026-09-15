import { plural } from './freshness.ts';

/** الإيقافُ بسبب عدم النشر — حالةٌ مشتقّةٌ لا عمودٌ في القاعدة.
 *
 *  «المحطاتُ التي تتوقّف عن النشر ٧٢ ساعة تتحوّل إلى الرماديّ بالكامل ويُكتب
 *  عليها بالأحمر: تمّ الإيقاف بسبب عدم النشر» — صاحبُ المنصّة، ١٥ أيلول.
 *
 *  ── ما «النشرُ» ──────────────────────────────────────────────────────────
 *
 *  أحدثُ `updated_at` بين منتجات المحطة. وزرُّ «تأكيد ونشر التوفّر» يكتبه
 *  على صفوف المحطة كلِّها — فمن يضغطه كلَّ يوم، ولو ليقول «لا وقود»، ناشرٌ
 *  ولا يُوقَف. والصمتُ وحدَه يُوقِف.
 *
 *  ولا كرونَ ولا عمود: الحالةُ تُحسب من الصفوف التي تحملها كلُّ صفحة أصلاً،
 *  فتبدأ فوراً على من صمت أكثرَ من ٧٢ ساعة (خمسَ عشرةَ محطةً من تسعٍ وأربعين
 *  يومَ كُتب هذا) وتزول لحظةَ يضغط الزرّ. */
export const SILENCE_HOURS = 72;

export interface Silent {
  is_demo?: boolean | null;
  products: { updated_at?: string | null }[];
}

/** آخرُ نشر — أو لا شيء إن لم تنشر قطّ. */
export function lastPublished(s: Silent): string | null {
  let at: string | null = null;
  for (const p of s.products) if (p.updated_at && (!at || p.updated_at > at)) at = p.updated_at;
  return at;
}

/** ساعاتُ الصمت. `Infinity` لمن لم تنشر قطّ. */
export function silentHours(s: Silent, now = Date.now()): number {
  const at = lastPublished(s);
  return at ? (now - new Date(at).getTime()) / 3_600_000 : Infinity;
}

/** موقوفةٌ بسبب عدم النشر؟ التجريبيّةُ لا تُوقَف. */
export function isSuspended(s: Silent, now = Date.now()): boolean {
  return !s.is_demo && silentHours(s, now) > SILENCE_HOURS;
}

/** «منذ ٣ أيام» — بالأيّام الكاملة، ويومٌ واحدٌ حين لم تُكمل الرابع. */
export function silentFor(s: Silent, now = Date.now()): string {
  const h = silentHours(s, now);
  if (!Number.isFinite(h)) return 'منذ التسجيل';
  const d = Math.max(1, Math.floor(h / 24));
  return `منذ ${plural(d, 'يوم', 'يومين', 'أيام', 'يوماً')}`;
}

export const SUSPENDED_LABEL = 'تم الإيقاف بسبب عدم النشر';
