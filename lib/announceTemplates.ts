import { PRODUCT_LABELS } from './products';
import type { FuelProduct } from '@/types/database';

/** Ready-made wordings for announcing a station that is not on the platform yet.
 *
 *  Templates rather than a free text box, for two reasons. A notification is
 *  read in one second on a lock screen, so its shape matters more than its
 *  wording — and every one of these is already sized to the 64/178 character
 *  limits APNs and FCM impose. And an announcement carries the platform's name:
 *  «المحطة التقنية» saying something is a claim people will act on, so the
 *  sentences are written once, carefully, instead of retyped under pressure.
 *
 *  Every template produces three things from the same inputs, so the push, the
 *  ticker and the news page can never drift apart:
 *    title  — the notification headline
 *    line   — the notification body, and the news page line
 *    ticker — the marquee item on the home page
 */
export interface TemplateInput {
  station: string;
  city: string;
  product: FuelProduct;
}

export interface AnnounceTemplate {
  id: string;
  label: string;
  hint: string;
  title: (i: TemplateInput) => string;
  line: (i: TemplateInput) => string;
  ticker: (i: TemplateInput) => string;
}

const p = (i: TemplateInput) => PRODUCT_LABELS[i.product];

/** «محطة» تُسبَق بشرط، لا تُلصَق.
 *
 *  المديرُ يكتب الاسم كما هو على اللافتة — «محطة الرحاب "شارع الثرثار"» —
 *  والقالبُ كان يُلصق الكلمةَ أمامه دائماً، فيصير «محطة محطة الرحاب». وهي
 *  لم تكن قبحاً وحسب: `summarise` كانت تعدّ ورودَ لفظة «محطة» في المتن
 *  لتخمين عدد المحطات، فضاعف التكرارُ العدّ — ثمانيةُ أسطر صارت «16 محطات».
 *
 *  ومن كتب «الرحاب» وحدها ما زال يُقرأ «محطة الرحاب». */
function named(station: string): string {
  const s = station.trim();
  return /^(ال)?محطة/.test(s) ? s : `محطة ${s}`;
}

export const ANNOUNCE_TEMPLATES: AnnounceTemplate[] = [
  {
    id: 'available',
    label: 'متوفّر الآن',
    hint: 'الوقود موجود في المحطة ويُصرف الآن',
    title: (i) => `${p(i)} متوفّر الآن`,
    line: (i) => `${named(i.station)} — ${i.city}`,
    ticker: (i) => `المحطة التقنية: ${p(i)} متوفّر الآن — ${named(i.station)}، ${i.city}`,
  },
  {
    id: 'supplied',
    label: 'تجهيز اليوم',
    hint: 'وصلت شحنة إلى المحطة اليوم',
    title: (i) => `تجهيز ${p(i)} اليوم`,
    line: (i) => `${named(i.station)} — ${i.city}`,
    ticker: (i) => `المحطة التقنية: تجهيز ${p(i)} اليوم — ${named(i.station)}، ${i.city}`,
  },
  {
    id: 'soon',
    label: 'يصل قريباً',
    hint: 'الشحنة في الطريق ولم تُصرف بعد',
    title: (i) => `${p(i)} يصل قريباً`,
    line: (i) => `${named(i.station)} — ${i.city}. لم يبدأ الصرف بعد.`,
    ticker: (i) => `المحطة التقنية: ${p(i)} يصل قريباً — ${named(i.station)}، ${i.city}`,
  },
  {
    id: 'running-low',
    label: 'الكمية تقارب النفاد',
    hint: 'ما تزال تُصرف لكن الكمية قليلة',
    title: (i) => `${p(i)} على وشك النفاد`,
    line: (i) => `${named(i.station)} — ${i.city}. الكمية محدودة.`,
    ticker: (i) => `المحطة التقنية: ${p(i)} يقارب النفاد — ${named(i.station)}، ${i.city}`,
  },
  {
    id: 'finished',
    label: 'نفدت الكمية',
    hint: 'انتهى الوقود — يمنع رحلة بلا فائدة',
    title: (i) => `نفد ${p(i)}`,
    line: (i) => `${named(i.station)} — ${i.city}. انتهت الكمية.`,
    ticker: (i) => `المحطة التقنية: نفد ${p(i)} — ${named(i.station)}، ${i.city}`,
  },
];

/** APNs truncates a title past ~64 and a body past ~178. Anything longer is not
 *  rejected — it is silently cut, usually mid-word, on the lock screen. */
export const TITLE_MAX = 64;
export const BODY_MAX = 178;

export function tooLong(t: AnnounceTemplate, i: TemplateInput): string | null {
  if (t.title(i).length > TITLE_MAX) return `العنوان أطول من ${TITLE_MAX} حرفاً`;
  if (t.line(i).length > BODY_MAX) return `النص أطول من ${BODY_MAX} حرفاً`;
  return null;
}

/** المتنُ الذي يخرج فعلاً إلى شاشة القفل — من متن الصفّ كما هو في القاعدة.
 *
 *  **والمناطقُ توجيهٌ لا نصّ.** كان `summarise` في notify-favorites يطبع
 *  `cities.join(' و')` في المتن حين تتعدّد المدن، فوصل الناسَ فجرَ الرابع من
 *  أيلول: «16 محطات في الفلوجة والرمادي والخالدية…» — عن محطةٍ واحدة. ضاع
 *  الخبرُ وبقي التوجيه.
 *
 *  والمتنُ المحفوظ سطرٌ لكلِّ مدينةِ **جمهور** (StationAnnouncePanel)، وكلُّها
 *  متطابقةٌ حين تكون المحطةُ واحدة — وهي حالُ كلِّ إعلانٍ متعدّد المدن في
 *  تاريخ المنصّة. فتُنزع بادئةُ المدينة، وتُزال المكرّرات:
 *
 *    سطرٌ فريدٌ واحد   ← هو المتن، ويصل الجميعَ سواء
 *    أكثرُ من سطر     ← تُوصَل بـ«·»، فتُسمّى المحطاتُ لا المناطق
 *
 *  وتُقرأ من الطرفين — المعاينةُ في اللوحة والمُرسِلُ في الحافّة — فلا يفترقان.
 *  (نسخةٌ منها في supabase/functions/notify-favorites/index.ts: الحافّةُ لا
 *  تستورد من lib، والرفعُ ملفٌّ واحد لكلِّ دالّة.) */
export function announceBody(storedBody: string): string {
  const lines = storedBody
    .split(/\r?\n/)
    .map((l) => {
      // البادئةُ لا تُنزع إلا بعد نقطةٍ صريحة.
      //
      // الشكلُ القديم كتبها دائماً: «• الرمادي: …». ونزعُ «ما قبل النقطتين»
      // بلا هذا الشرط يبتلع الساعةَ من «الإنترنت ينقطع 6:00 صباحاً» فيبقى
      // «00 صباحاً» — وتنبيهُ المنصّة نصٌّ حرٌّ يكتبه المدير كما يشاء.
      const bulleted = /^[•\-]/.test(l.trim());
      const t = l.replace(/^[•\-\s]+/, '');
      return (bulleted ? t.replace(/^[^:\n—]{1,20}:\s*/, '') : t).trim();
    })
    .filter(Boolean);
  const unique = [...new Set(lines)];
  if (!unique.length) return storedBody.trim().slice(0, BODY_MAX);
  return unique.join(' · ').slice(0, BODY_MAX);
}
