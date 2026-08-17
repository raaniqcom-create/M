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

export const ANNOUNCE_TEMPLATES: AnnounceTemplate[] = [
  {
    id: 'available',
    label: 'متوفّر الآن',
    hint: 'الوقود موجود في المحطة ويُصرف الآن',
    title: (i) => `${p(i)} متوفّر الآن`,
    line: (i) => `محطة ${i.station} — ${i.city}`,
    ticker: (i) => `المحطة التقنية: ${p(i)} متوفّر الآن — محطة ${i.station}، ${i.city}`,
  },
  {
    id: 'supplied',
    label: 'تجهيز اليوم',
    hint: 'وصلت شحنة إلى المحطة اليوم',
    title: (i) => `تجهيز ${p(i)} اليوم`,
    line: (i) => `محطة ${i.station} — ${i.city}`,
    ticker: (i) => `المحطة التقنية: تجهيز ${p(i)} اليوم — محطة ${i.station}، ${i.city}`,
  },
  {
    id: 'soon',
    label: 'يصل قريباً',
    hint: 'الشحنة في الطريق ولم تُصرف بعد',
    title: (i) => `${p(i)} يصل قريباً`,
    line: (i) => `محطة ${i.station} — ${i.city}. لم يبدأ الصرف بعد.`,
    ticker: (i) => `المحطة التقنية: ${p(i)} يصل قريباً — محطة ${i.station}، ${i.city}`,
  },
  {
    id: 'running-low',
    label: 'الكمية تقارب النفاد',
    hint: 'ما تزال تُصرف لكن الكمية قليلة',
    title: (i) => `${p(i)} على وشك النفاد`,
    line: (i) => `محطة ${i.station} — ${i.city}. الكمية محدودة.`,
    ticker: (i) => `المحطة التقنية: ${p(i)} يقارب النفاد — محطة ${i.station}، ${i.city}`,
  },
  {
    id: 'finished',
    label: 'نفدت الكمية',
    hint: 'انتهى الوقود — يمنع رحلة بلا فائدة',
    title: (i) => `نفد ${p(i)}`,
    line: (i) => `محطة ${i.station} — ${i.city}. انتهت الكمية.`,
    ticker: (i) => `المحطة التقنية: نفد ${p(i)} — محطة ${i.station}، ${i.city}`,
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
