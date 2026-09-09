/** الحالاتُ الثلاث ولغتُها — مشتركةٌ بين البوتين.
 *
 *  ── لماذا هنا لا في كلٍّ منهما ───────────────────────────────────────────
 *
 *  الدالّةُ الطرفيّة لا تقرأ من `lib/`، ولذلك في هذا المستودع نسخٌ مكرّرة:
 *  `PRODUCT_LABELS` و`CITIES` و`isOpenNow` مكتوبةٌ مرّتين أو ثلاثاً. وكلُّ
 *  نسخةٍ منها تأخّرت مرّةً عن أختها — و`isOpenNow` في تيليجرام جهلت
 *  `temp_closed` وحدَها، فكانت محطةٌ أغلقها صاحبُها تُعرض «مفتوحة».
 *
 *  فالحالاتُ الثلاثُ تُكتب مرّةً. وهي المنطقُ الذي طلبته محطةٌ بالهاتف:
 *  «نرجو إضافة خيار: منتج غير متوفر - متوفر - متوقع، ويحدد الوقت» — ولو
 *  تفرّقت بين البوتين لَقال أحدُهما غيرَ ما يقوله الآخر عن الصفّ نفسِه. */

const BAGHDAD = 'Asia/Baghdad';

/** تاريخُ بغداد بصيغة YYYY-MM-DD، بإزاحةِ أيّامٍ اختياريّة. */
export const baghdadDay = (plus = 0): string =>
  new Date(Date.now() + plus * 86_400_000).toLocaleDateString('en-CA', { timeZone: BAGHDAD });

export type OwnerState = 'in' | 'soon' | 'out';

export interface StateRow {
  is_available?: boolean | null;
  runs_out_at?: string | null;
  expected_at?: string | null;
  expected_period?: string | null;
  expected_time?: string | null;
}

/** هل ما زال معروضاً؟ متوفّرٌ، ولم يمرّ موعدُ النفاد الذي أعلنه صاحبُه.
 *
 *  ولا تسأل عن الحداثة: هذه قراءةُ **ما ضبطه المالك** لتُعرض عليه في لوحته،
 *  وزرُّه يقلبها. والحداثةُ شرطُ ما يُقال للناس، لا شرطُ ما يراه هو. */
export const stillLive = (r: StateRow | null | undefined): boolean =>
  !!r?.is_available && !(r.runs_out_at && r.runs_out_at <= new Date().toISOString());

export const stateOf = (r: StateRow | null | undefined): OwnerState =>
  stillLive(r) ? 'in' : r?.expected_at ? 'soon' : 'out';

export const MARK: Record<OwnerState, string> = { in: '✅', soon: '🕒', out: '⛔' };

/** الحالةُ التي تليها في الدوران: متوفّر ← متوقّع ← غير متوفّر ← متوفّر. */
export const nextState = (cur: OwnerState): OwnerState =>
  cur === 'in' ? 'soon' : cur === 'soon' ? 'out' : 'in';

export const PERIOD_WORD: Record<string, string> = {
  morning: 'الصباح',
  afternoon: 'العصر',
  evening: 'المساء',
};

/** «اليوم» / «غداً» / «بعد غد» — وما فات يُقال فائتاً لا يُطبع تاريخاً. */
export function dayWord(d: string): string {
  if (d === baghdadDay()) return 'اليوم';
  if (d === baghdadDay(1)) return 'غداً';
  if (d === baghdadDay(2)) return 'بعد غد';
  return d < baghdadDay() ? 'فات موعده' : d;
}

/** «٦:٣٠ صباحاً» — مرآةُ formatTime في lib/hours.ts، وتقبل "HH:MM" و"HH:MM:SS". */
export function hourWord(t: string): string {
  const h24 = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${h24 < 12 ? 'صباحاً' : 'مساءً'}`;
}

/** ذيلُ الوعد: الساعةُ إن ذُكرت، وإلّا الفترة. والساعةُ تغلب — «الصباح ٦:٠٠»
 *  حشوٌ يُقرأ مرّتين. مرآةُ whenLabel في lib/hours.ts. */
export const whenWord = (period?: string | null, time?: string | null): string =>
  time ? hourWord(time) : period ? (PERIOD_WORD[period] ?? '') : '';

/** «غداً ٦:٠٠ صباحاً» — الجملةُ كاملةً. ولا ذيلَ لموعدٍ فات: يصف لحظةً لم تقع. */
export function promiseWord(r: StateRow): string {
  if (!r.expected_at) return '';
  const head = dayWord(r.expected_at);
  if (r.expected_at < baghdadDay()) return head;
  const tail = whenWord(r.expected_period, r.expected_time);
  return tail ? `${head} ${tail}` : head;
}
