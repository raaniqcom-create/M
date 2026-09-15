import { plural } from './freshness';

/** صفُّ «متابعة المحطات» كما تعيده admin_outreach(). */
export interface OutreachRow {
  id: string;
  name: string;
  city: string;
  phone: string;
  contact_name: string | null;
  created_at: string;
  temp_closed: boolean;
  devices: number;
  telegram: number;
  last_update: string | null;
  watchers: number;
}

export const STALE_DAYS = 2;

export const daysSince = (iso: string | null | undefined): number =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 999;

/** مربوطةٌ بقناةٍ تصلها مجّاناً (جهازٌ أو تيليغرام). */
export const isLinked = (r: OutreachRow): boolean => r.devices > 0 || r.telegram > 0;

/** ربطت الجهازَ وتوقّفت عن التحديث — يومان فأكثر، أو لم تحدّث قطّ. */
export const isStale = (r: OutreachRow): boolean => isLinked(r) && daysSince(r.last_update) >= STALE_DAYS;

const who = (r: OutreachRow) => {
  const n = (r.contact_name ?? '').trim();
  return n && !/محط[ةه]/.test(n) ? `سيد ${n}` : 'سيدي صاحب المحطة';
};
const days = (n: number) => plural(n, 'يوم واحد', 'يومين', 'أيام', 'يوماً');
const folks = (n: number) => plural(n, 'مشترك واحد', 'مشتركان', 'مشتركين', 'مشترك');

/** رسالةُ «اربط جهازك» — بصيغة صاحب المنصّة: الاسمُ، المحطةُ، المشتركون
 *  الذين يفقدهم، الأيّامُ بلا ربط، والطريقةُ خطوةً خطوة. */
export function linkMessage(r: OutreachRow): string {
  const d = daysSince(r.created_at);
  return (
    `السلام عليكم ${who(r)}،\n` +
    `أنت من إدارة «${r.name}» في ${r.city} — و${folks(r.watchers)} في ${r.city} ينتظرون خبر محطتك على هواتفهم. ` +
    `ومنذ ${days(d)} محطتك غير مربوطة بجهازك، فلا يصلك تذكيرٌ ولا يصلهم ما تُعلنه.\n\n` +
    `الطريقة — دقيقة واحدة:\n` +
    `1. افتح تطبيق المحطة التقنية وادخل لوحة محطتك.\n` +
    `2. تظهر ورقة «لا يصلك تنبيه من المنصة» — اضغط «السماح بالتنبيهات» واقبل إذن الهاتف.\n` +
    `3. إن لم تظهر الورقة: إعدادات الهاتف ← التطبيقات ← المحطة التقنية ← الإشعارات ← سماح، ثم أعد فتح اللوحة.\n\n` +
    `بعدها كل ما تُعلنه يصل إلى ${folks(r.watchers)} بضغطة زر.\n— إدارة المحطة التقنية`
  );
}

/** رسالةُ «حدّث محطتك» لمن ربط الجهاز وتوقّف. */
export function staleMessage(r: OutreachRow): string {
  const d = daysSince(r.last_update);
  const since = d >= 999 ? 'ولم تُحدَّث قطّ' : `ولم تُحدَّث منذ ${days(d)}`;
  return (
    `السلام عليكم ${who(r)}،\n` +
    `محطة «${r.name}» مربوطةٌ بجهازك ${since} — و${folks(r.watchers)} في ${r.city} لا يرون محطتك في «المتاح الآن».\n\n` +
    `افتح تطبيق المحطة التقنية ← لوحة محطتك ← اضبط المنتجات ← اضغط الزر الأخضر. ` +
    `ضغطة واحدة تعيد محطتك أمامهم فوراً ويصلهم إشعاراً بها.\n— إدارة المحطة التقنية`
  );
}

/** نسخةٌ قصيرة للإشعار الدافع (المتنُ يُقصّ عند 300 حرف في owner-daily). */
export function stalePush(r: OutreachRow): string {
  const d = daysSince(r.last_update);
  const since = d >= 999 ? 'لم تُحدَّث قطّ' : `لم تُحدَّث منذ ${days(d)}`;
  return `${who(r)}: محطة «${r.name}» ${since}، و${folks(r.watchers)} في ${r.city} لا يرونها في المتاح الآن. اضبط المنتجات واضغط الزر الأخضر — ضغطة تعيدها أمامهم فوراً.`;
}

export const waLink = (phone: string, text: string): string | null => {
  const n = phone.replace(/\D/g, '').replace(/^(00)?964/, '').replace(/^0+/, '');
  return /^7\d{9}$/.test(n) ? `https://wa.me/964${n}?text=${encodeURIComponent(text)}` : null;
};
