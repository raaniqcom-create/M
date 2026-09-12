import type { AlertChoice } from './alerts.ts';
import { NEWS } from './news.ts';
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
  /** قصّةُ المنصّة نفسِها: «جديدُ المحطة التقنية» — تُعرض نصّاً لا صورةً. */
  kind?: 'station' | 'platform';
  news?: { title: string; lines: string[]; href: string; label: string };
}

/** حالةُ المنصّة — أوّلَ الشريط دائماً، كحالة صاحب الحساب في إنستغرام. */
export function platformStory(): Story {
  return {
    id: NEWS.id,
    name: 'المحطة التقنية',
    short: 'جديد المحطة',
    slug: null,
    city: '',
    products: [],
    at: NEWS.at,
    kind: 'platform',
    news: { title: NEWS.title, lines: NEWS.lines, href: NEWS.href, label: NEWS.label },
  };
}

/** «محطة وقود الحق المشيدة» ← «الحق». الاسمُ البارزُ وحدَه تحت الحلقة —
 *  «لا تُظهر كلماتِ المشيدة ومحطة، فقط الاسمُ البارز كي يكون أسهلَ للمستخدم».
 *  لا يلمس `normalizeName` لأنّ تلك تطوي ة→ه للمطابقة لا للقراءة. */
export function shortName(name: string): string {
  const NOISE = new Set(['محطة', 'محطه', 'وقود', 'الوقود', 'تعبئة', 'تعبئه']);
  // ما يلي الاسمَ من صفةٍ أو موضع: «المشيدة»، «النموذجية»، «قرب سيطرة…».
  const TAIL = /^(ال)?(مشيد|نموذجي|حكومي|حديث|اهلي|أهلي|نفطي)|^للمنتوجات$|^قرب$/;
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && NOISE.has(words[0])) words.shift();
  const cut = words.findIndex((w, i) => i > 0 && TAIL.test(w));
  const core = cut > 0 ? words.slice(0, cut) : words;
  // «الحق» تكفي؛ و«ركن الجامعة» لا تُقطع — المضافُ بلا «ال» يحتاج مضافَه إليه.
  return core.slice(0, core[0].startsWith('ال') ? 1 : 2).join(' ');
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
  // غيرُ المرئيّ أوّلاً ثمّ الأحدث — كترتيب إنستغرام نفسِه. وقصّةُ المنصّة
  // قبل الكلّ، تظهر ولو لم تكن قصّةُ محطةٍ واحدة.
  out.sort((a, b) => {
    const sa = isSeen(a.id, a.at) ? 1 : 0;
    const sb = isSeen(b.id, b.at) ? 1 : 0;
    return sa - sb || b.at.localeCompare(a.at);
  });
  return [platformStory(), ...out];
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
