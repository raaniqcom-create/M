import type { AlertChoice } from './alerts.ts';
import { isOffered } from './products.ts';
import type { FuelProduct, StationWithStatus } from '../types/database.ts';

/** «حالة المحطة» — قصّةٌ كحالات إنستغرام: محطةٌ عندها الآن وقودٌ يُعرض.
 *
 *  ── ولا جدولَ في القاعدة ──────────────────────────────────────────────────
 *
 *  القصّةُ اشتقاقٌ من `station_products` الذي تحمله الرئيسيةُ أصلاً: منتجٌ
 *  متوفّرٌ أُكّد خلال ٢٤ ساعة ولم يمرّ موعدُ نفاده والمحطةُ مفتوحة — وهي قاعدةُ
 *  `isOffered` حرفيّاً، فـ«تنتهي عند النفاد وتبقى ٢٤ ساعة» لا تُكتب مرّتين.
 *  ولمّا كانت الرئيسيةُ تتحدّث لحظيّاً (قناةُ `home-updates`) تسقط القصّةُ
 *  لحظةَ يُطفئ صاحبُها المنتج. */
export interface Story {
  id: string;
  name: string;
  short: string;
  slug: string | null;
  city: string;
  products: FuelProduct[];
  /** أحدثُ تأكيدٍ بين منتجاتها — وهو ما يُختم على الصورة. */
  at: string;
}

/** «محطة وقود الحق المشيدة» ← «الحق المشيدة». للعرض تحت الحلقة — لا يلمس
 *  `normalizeName` لأنّ تلك تطوي ة→ه للمطابقة لا للقراءة. */
export function shortName(name: string): string {
  const NOISE = new Set(['محطة', 'محطه', 'وقود', 'الوقود', 'تعبئة', 'تعبئه']);
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && NOISE.has(words[0])) words.shift();
  return words.slice(0, 2).join(' ');
}

export function storiesFor(
  stations: StationWithStatus[],
  choice: AlertChoice | null
): Story[] {
  const cities = new Set(choice?.cities ?? []);
  const wanted = new Set<FuelProduct>(choice?.products ?? []);
  const out: Story[] = [];
  for (const s of stations) {
    if (cities.size && !cities.has(s.city)) continue;
    let offered = s.products.filter((p) => isOffered(s, p));
    // والصورةُ تعرض ما يهمّه منها فقط: من اختار الكاز لا يُفتح له بانزينٌ.
    if (wanted.size) offered = offered.filter((p) => wanted.has(p.product));
    if (!offered.length) continue;
    const at = offered.map((p) => p.updated_at).sort().at(-1)!;
    out.push({
      id: s.id,
      name: s.name,
      short: shortName(s.name),
      slug: s.slug,
      city: s.city,
      products: offered.map((p) => p.product),
      at,
    });
  }
  // غيرُ المرئيّ أوّلاً ثمّ الأحدث — كترتيب إنستغرام نفسِه.
  return out.sort((a, b) => {
    const sa = isSeen(a.id, a.at) ? 1 : 0;
    const sb = isSeen(b.id, b.at) ? 1 : 0;
    return sa - sb || b.at.localeCompare(a.at);
  });
}

export const SEEN = 'story-seen:';

/** رُئيت بهذا التأكيد بعينه: تأكيدٌ أحدثُ يعيدها خضراء. */
export function isSeen(id: string, at: string): boolean {
  try {
    return localStorage.getItem(SEEN + id) === at;
  } catch {
    return false;
  }
}

export function markSeen(id: string, at: string): void {
  try {
    localStorage.setItem(SEEN + id, at);
  } catch {
    /* تصفّحٌ خاصّ */
  }
}
