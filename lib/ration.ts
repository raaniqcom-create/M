/** الفرديُّ والزوجيّ — قرارُ محافظة الأنبار في توزيع البنزين، **مؤقّت**.
 *
 *  «في الأيّام الفرديّة يُسمح بتزويد المركبات التي ينتهي رقمُ لوحتها برقمٍ
 *  فرديّ، وفي الأيّام الزوجيّة بالزوجيّ. ويُعمل به اعتباراً من ١٣/٩/٢٠٢٦ —
 *  وغداً يومٌ فرديّ.»
 *
 *  ── القاعدةُ حرفيّاً ─────────────────────────────────────────────────────
 *
 *  فرديّةُ اليوم من **رقمه في الشهر** كما في القرار: ١٣ فرديّ، ١٤ زوجيّ. وعند
 *  انقلاب الشهر (٣٠ ثمّ ١، أو ٣١ ثمّ ١) يقع يومان فرديّان متتاليان — وهو ما
 *  يقوله القرارُ لا ما نصحّحه نحن.
 *
 *  ولا يُحفظ من اللوحة إلّا رقمُها الأخير: ما لا يُحتاج لا يُخزَّن. */

export const RATION = {
  /** مؤقّت — يُقلب إلى `false` بسطرٍ حين يُلغى القرار فتختفي البطاقةُ من كلّ مكان. */
  active: true,
  from: '2026-09-13',
  product: 'البنزين',
  decree: `قرار

لمتطلبات تنظيم عملية تجهيز منتوج البنزين في محافظة الأنبار، تقرر اعتماد نظام التوزيع (الفردي والزوجي) للمركبات.

كما تقرر منع مبيت المركبات أو تواجدها في الطوابير أمام المحطات خلال ساعات الليل.

وبناءً على توجيه السيد محافظ الأنبار، تتولى قيادة شرطة الأنبار ومديرية مرور الأنبار إسناد إدارات محطات التوزيع في المحافظة، واتخاذ ما يلزم من إجراءات لضمان تطبيق هذا القرار وتنظيم انسيابية التجهيز وفق الضوابط المعتمدة.

آلية اعتماد نظام الفردي والزوجي

في الأيام الفردية: يُسمح بتزويد المركبات التي ينتهي رقم لوحتها برقم فردي.
في الأيام الزوجية: يُسمح بتزويد المركبات التي ينتهي رقم لوحتها برقم زوجي.

ويُعمل بهذا التنظيم اعتباراً من ١٣ / ٩ / ٢٠٢٦.`,
};

export type Parity = 'odd' | 'even';

export const PARITY_LABEL: Record<Parity, string> = { odd: 'فرديّ', even: 'زوجيّ' };

/** ١٣ ← فرديّ: رقمُ اليوم في الشهر. */
export function dayParity(isoDate: string): Parity {
  const day = Number(isoDate.slice(8, 10));
  return day % 2 === 1 ? 'odd' : 'even';
}

const INDIC = '٠١٢٣٤٥٦٧٨٩';

/** آخرُ رقمٍ في نصّ اللوحة — بعد تحويل الأرقام الهنديّة — أو لا شيء. */
export function plateDigit(plate: string): number | null {
  const latin = plate.replace(/[٠-٩]/g, (ch) => String(INDIC.indexOf(ch)));
  const m = latin.match(/\d(?!.*\d)/);
  return m ? Number(m[0]) : null;
}

export function plateParity(plate: string): Parity | null {
  const d = plateDigit(plate);
  return d === null ? null : d % 2 === 1 ? 'odd' : 'even';
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** دورُ هذه اللوحة: اليومَ أم لا، وأقربُ يومٍ يحقّ لها، وأسبوعٌ كاملٌ من اليوم. */
export function turnFor(
  plate: string,
  today: string
): { parity: Parity; todayOk: boolean; nextOk: string; week: { date: string; ok: boolean }[] } | null {
  const parity = plateParity(plate);
  if (!parity) return null;
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, ok: dayParity(date) === parity };
  });
  const todayOk = week[0].ok;
  const nextOk = week.find((d) => d.ok)!.date;
  return { parity, todayOk, nextOk, week };
}

/** «١٤/٩» — يومٌ وشهرٌ للعرض. */
export function shortDate(isoDate: string): string {
  return `${Number(isoDate.slice(8, 10))}/${Number(isoDate.slice(5, 7))}`;
}
