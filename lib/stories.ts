import type { AlertChoice } from './alerts.ts';
import type { OpenAnnouncement } from './announcements.ts';
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
  /** قصّةُ المنصّة نفسِها: «جديدُ المحطة التقنية» — تُعرض نصّاً لا صورةً.
   *  و`announced`: محطةٌ **غيرُ مسجّلة** أعلنت عنها الإدارةُ بإشعار — حلقتُها
   *  حمراء («أضفها إلى الحالات — غير مسجّلة وتظهر بالأحمر»). */
  kind?: 'station' | 'platform' | 'announced';
  news?: { title: string; lines: string[]; image_url: string | null; href: string | null; label: string | null };
}

/** صفُّ `platform_stories` — تكتبه الإدارةُ من «الحالات» وتقرؤه الرئيسيةُ (RLS: النشطُ المنشور). */
export interface PlatformStoryRow {
  id: string;
  title: string;
  lines: string[];
  image_url: string | null;
  href: string | null;
  label: string | null;
  published_at: string;
}

/** اسمُ حلقة المنصّة من عنوانها: كلمةٌ لاتينيّة أولى تُؤخذ كما هي («CarPlay»)،
 *  وإلّا قاعدةُ `shortName` بعد إسقاط علامات الترقيم («الآيفون:» ← «الآيفون»). */
export function platformShort(title: string): string {
  // ما قبل أوّل فاصلٍ (— : ،) هو الاسم: «دوري — الفرديّ…» ← «دوري».
  const head = title.split(/\s*[:—–،]\s*/)[0] ?? title;
  const words = head
    .split(/\s+/)
    .map((w) => w.replace(/^[«"(]+|[.!؟»")]+$/g, ''))
    .filter(Boolean);
  if (/^[A-Za-z]/.test(words[0] ?? '')) return words[0];
  return shortName(words.join(' '));
}

/** حالةُ المنصّة — أوّلَ الشريط، كحالة صاحب الحساب في إنستغرام.
 *
 *  `at` هي `published_at` **حرفيّاً** كما جاءت من القاعدة: «رُئيت» مساواةُ
 *  نصّ، وعدّادُ المشاهدات مفتاحُه هذا النصّ — فإعادةُ النشر (published_at جديدة)
 *  تعيد الحلقةَ خضراء وتبدأ عدّاداً جديداً. */
export function platformStory(r: PlatformStoryRow): Story {
  return {
    id: r.id,
    name: 'المحطة التقنية',
    // حلقاتُ المنصّة لا تحمل الاسمَ نفسَه: البارزُ من العنوان («العبوات»، «دوري»، «CarPlay»).
    short: platformShort(r.title),
    slug: null,
    city: '',
    products: [],
    at: r.published_at,
    kind: 'platform',
    news: { title: r.title, lines: r.lines, image_url: r.image_url, href: r.href, label: r.label },
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
  choice: AlertChoice | null,
  /** أخبارُ اللوحة الحمراء — ما ليس مسجّلاً ولم تقل الإدارةُ إنّه انتهى. */
  announced: OpenAnnouncement[] = [],
  /** حالاتُ المنصّة من القاعدة — الأحدثُ أوّلاً كما جاءت. */
  platform: PlatformStoryRow[] = []
): Story[] {
  const cities = new Set(choice?.cities ?? []);
  const wanted = new Set<FuelProduct>(choice?.products ?? []);
  const out: Story[] = [];
  for (const a of announced) {
    // المسجّلةُ لها قصّتُها من منتجاتها؛ وما حكمت الإدارةُ بنفاده سقط.
    if (a.station_id || a.admin_verdict === 'gone') continue;
    const inCity =
      !cities.size ||
      (a.origin_city !== null && cities.has(a.origin_city)) ||
      !!a.cities?.some((c) => cities.has(c));
    if (!inCity) continue;
    if (wanted.size && a.product && !wanted.has(a.product)) continue;
    out.push({
      id: `ann:${a.id}`,
      name: a.station_name,
      short: shortName(a.station_name),
      slug: null,
      city: a.origin_city ?? a.cities?.[0] ?? '',
      products: a.product ? [a.product] : [],
      at: a.send_at,
      kind: 'announced',
    });
  }
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
  // الأحدثُ يميناً وهكذا — بالزمن وحدَه، للمنصّة والمحطات سواء.
  //
  // كان الترتيب: حالاتُ المنصّة أوّلاً ثمّ غيرُ المرئيّ ثمّ الأحدث. فصارت أربعُ
  // حلقاتٍ رماديّة للمنصّة تحتلّ يمينَ الشريط وتدفع محطةً أعلنت قبل دقائق إلى
  // ما وراء الحافّة — «أريد الحالاتِ الأحدثَ تظهر يميناً وهكذا» (١٤ أيلول).
  // واللونُ يقول ما رُئي؛ الموضعُ يقول ما جدّ.
  const all = [...platform.map(platformStory), ...out];
  all.sort((a, b) => b.at.localeCompare(a.at));
  return all;
}

/** رابطُ الحالة فيديو (mp4) لا صورة — يُعرض بـ<video> ويُترك للحلقة الشعار. */
export const isVideo = (url: string | null | undefined): boolean => !!url && /\.(mp4|webm)(\?|$)/i.test(url);

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
