import { isOffered } from './products.ts';
import { hasRunOut } from './hours.ts';
import { normalizeName } from './nearbyFuel.ts';
import type { ExpectedPeriod } from './hours.ts';
import type { FuelProduct, StationWithStatus } from '../types/database.ts';

/** بناءُ لوحة الجدول — حسابٌ خالصٌ بلا شبكة.
 *
 *  منفصلٌ عن `lib/scheduleData.ts` للسبب الذي فصل `lib/schedule.ts` عنه:
 *  ذاك يستورد `supabase` فلا يعمل إلا في المتصفّح، وهذا يُفحص بـnode بلا
 *  قاعدةٍ ولا مفاتيح — و`scripts/test-schedule-board.mjs` يفحصه فعلاً. */

export interface ScheduleRow {
  id: string;
  for_date: string;
  product: FuelProduct;
  batch_id: string;
  raw_name: string;
  station_name: string;
  city: string | null;
  linked_station_id: string | null;
  note: string | null;
}

/** «اليوم» و«غداً» بتقويم بغداد لا بساعة الجهاز.
 *
 *  هاتفٌ مضبوطٌ على توقيتٍ آخر كان سيقرأ جدولَ الغد جدولَ بعد غد. و`en-CA`
 *  هي الصيغةُ الوحيدة التي تُخرج YYYY-MM-DD جاهزةً للمقارنة النصّية. */
export function baghdadDate(plusDays = 0): string {
  return new Date(Date.now() + plusDays * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Baghdad',
  });
}

function baghdadHour(): number {
  return Number(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      hour12: false,
    })
  );
}

/** اليومُ الذي تعرضه الصفحة.
 *
 *  ── سؤالُ صاحب المنصّة: من يفتحها ظهراً كيف يقرؤها؟ ────────────────────
 *
 *  كانت الصفحةُ تقول «محطات غداً» دائماً، فمن يفتحها ظهراً يقرأ عنواناً عن
 *  يومٍ لم يأتِ بينما الوقودُ يصل الآن.
 *
 *  فقاعدةٌ واحدة: **بعد التاسعة مساءً الغد، وما دونها اليوم** — وهي ساعةُ
 *  نشر القناة تقريباً. وينقلب العنوانُ عند منتصف الليل وحدَه: التاريخُ نفسُه
 *  يصير «اليوم» بلا أن يتبدّل محتوى. قرارُ صاحب المنصّة. */
export const BOARD_FLIP_HOUR = 21;

export function boardDate(): string {
  return baghdadHour() >= BOARD_FLIP_HOUR ? baghdadDate(1) : baghdadDate();
}

/** سطرٌ في اللوحة — أيّاً كان مصدرُه. */
export interface BoardRow {
  key: string;
  name: string;
  city: string | null;
  product: FuelProduct;
  stationId: string | null;
  /** من الجدول المنشور، أم من لوحة المحطة نفسِها. */
  source: 'channel' | 'station';
  /** `expected` وُعد به · `arrived` معروضٌ الآن · `out` نفد بعد أن وصل. */
  state: 'expected' | 'arrived' | 'out';
  /** الصباح/العصر/المساء — من لوحة المحطة وحدها. */
  period: ExpectedPeriod | null;
  /** وردت في الجدول المنشور أيضاً — تأكيدٌ مضاعفٌ لا تكرار. */
  alsoInChannel?: boolean;
}

/** أهما محطةٌ واحدة؟
 *
 *  **الاحتواءُ لا التطابق.** القناةُ تكتب «غصن الزيتون جويبة» والمنصّةُ تسجّلها
 *  «محطة تعبئة وقود غصن الزيتون» — والتطبيعُ يُسقط «محطة» و«تعبئة» و«وقود»
 *  فيبقى «غصن الزيتون» داخلَ الأولى لا مساوياً لها. فتطابقٌ حرفيٌّ كان
 *  سيُظهر محطةً واحدةً مرّتين، وهي حالةٌ حيّةٌ في القاعدة يومَ كُتب هذا.
 *
 *  **وبالكلمات لا بالحروف.** الاحتواءُ الحرفيُّ يجعل «الحق» داخلَ
 *  «الحقلانية» — محطتان مختلفتان في محافظةٍ واحدة. فكلماتُ الأقصر يجب أن
 *  ترد كلُّها كلماتٍ كاملةً في الأطول.
 *
 *  والمنطقةُ شرط، والاسمُ ذو الكلمة الواحدة لا يُدمج إلا بتطابقٍ تامّ:
 *  كلمةٌ واحدةٌ مشتركةٌ دليلٌ ضعيفٌ على أنّهما محطةٌ واحدة. */
function sameStation(
  a: { name: string; city: string | null },
  b: { name: string; city: string | null }
): boolean {
  if (normalizeName(a.city ?? '') !== normalizeName(b.city ?? '')) return false;
  const x = normalizeName(a.name);
  const y = normalizeName(b.name);
  if (!x || !y) return false;
  if (x === y) return true;

  const wx = x.split(' ').filter(Boolean);
  const wy = y.split(' ').filter(Boolean);
  const [short, long] = wx.length <= wy.length ? [wx, wy] : [wy, wx];
  if (short.length < 2) return false;
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

/** يبني لوحةَ يومٍ واحدٍ من مصدرين.
 *
 *  ── ولماذا مصدران ───────────────────────────────────────────────────────
 *
 *  الجدولُ كان يقرأ ما يُنشر من تلغرام وحدَه. وبعضُ المحطات تعلن في لوحتها
 *  أنّ منتجاً متوقَّعٌ غداً — وهو وعدٌ مكتوبٌ في القاعدة منذ زمن
 *  (`station_products.expected_at`) لا يقرؤه الجدول. فصار يقرؤه.
 *
 *  ── ومحطاتُ المنصّة أوّلاً ───────────────────────────────────────────────
 *
 *  لأنّ لها صفحةً وصاحباً يُحدّثها ورقماً يُتّصل به — والوعدُ فيها يتحوّل خبراً
 *  حيّاً بضغطة: إن فعّل صاحبُها المنتجَ صار السطرُ «وصل»، وإن نفد بقي مكتوباً
 *  عليه «نفد» ولم يُمحَ. فمن قرأ الجدولَ صباحاً يعرف لماذا اختفت، ولا يظنّ
 *  المنصّةَ كذبت.
 *
 *  ── والتكرارُ يُدمج، ولوحةُ المحطة تغلب ─────────────────────────────────
 *
 *  «غصن الزيتون» وردت في جدول القناة غيرَ مربوطة، وهي نفسُها أعلنت توقّعاً من
 *  لوحتها. فالسطرُ واحدٌ باسمها الرسميّ وحالتِها الحيّة — لأنّها أدقّ، قرارُ
 *  صاحب المنصّة — ويُقال إنّ الخبرَ ورد في الجدول المنشور أيضاً.
 *
 *  والوعدُ يُقيَّد بيوم اللوحة وحدَه: في القاعدة وعودٌ من آب لم تُنظَّف،
 *  و`isListed` تُبقيها إلى الأبد. */
export function buildBoard(
  schedule: ScheduleRow[],
  stations: StationWithStatus[],
  day: string
): BoardRow[] {
  const rows: BoardRow[] = [];

  // ــ المصدرُ الأوّل: لوحاتُ المحطات ــــــــــــــــــــــــــــــــــــــ
  for (const st of stations) {
    for (const p of st.products) {
      if (p.expected_at !== day) continue;
      const arrived = isOffered(st, p);
      // **«نفد» تُقال بدليلٍ واحدٍ صريح: موعدُ نفادٍ أعلنه صاحبُها ومضى.**
      //
      // ولا تُستنتج من الإطفاء: صفٌّ مطفأٌ بلا موعدِ نفادٍ لا يُميَّز عن وعدٍ
      // لم يصل بعد — كلاهما `is_available = false` و`runs_out_at = null`.
      // و`updated_at` لا يُميّزهما أيضاً: «تأكيد ونشر التوفّر» يكتبه على صفوف
      // المحطة كلِّها، فمحطةٌ أكّدت منتجاً آخرَ صباحاً كانت ستُقرأ «نفد» وهي لم
      // تستلم شيئاً. فالوعدُ الذي لم يصل يبقى «متوقّع» — وهو الصدق.
      const out = p.is_available === true && hasRunOut(p.runs_out_at);
      rows.push({
        key: `s:${st.id}:${p.product}`,
        name: st.name,
        city: st.city,
        product: p.product,
        stationId: st.id,
        source: 'station',
        state: arrived ? 'arrived' : out ? 'out' : 'expected',
        period: p.expected_period,
      });
    }
  }

  // ــ المصدرُ الثاني: الجدولُ المنشور ــــــــــــــــــــــــــــــــــــ
  for (const r of schedule) {
    if (r.for_date !== day) continue;

    const me = { name: r.station_name, city: r.city };
    const hit = rows.find(
      (x) =>
        x.product === r.product &&
        ((r.linked_station_id && x.stationId === r.linked_station_id) || sameStation(x, me))
    );

    if (hit) {
      // لوحةُ المحطة تغلب — «لأنّها أدقّ»، قرارُ صاحب المنصّة. ويُقال إنّ
      // الخبرَ ورد في الجدول المنشور أيضاً: تأكيدٌ مضاعفٌ لا تكرار.
      if (hit.source === 'station') hit.alsoInChannel = true;
      continue;
    }

    rows.push({
      key: `c:${r.id}`,
      name: r.station_name,
      city: r.city,
      product: r.product,
      stationId: r.linked_station_id,
      source: 'channel',
      state: 'expected',
      period: null,
    });
  }

  return rows;
}

/** مجموعةٌ واحدة: **منطقةٌ في يوم**. */
export interface BoardGroup {
  city: string | null;
  rows: BoardRow[];
  products: FuelProduct[];
}

const STATE_RANK = { arrived: 0, expected: 1, out: 2 } as const;

/** يُجمَع بالمنطقة — لا بالمنتج.
 *
 *  السؤالُ الذي يُفتح له التطبيقُ منطقةٌ لا منتج: «ما الذي يصل منطقتي؟»
 *  والمنتجُ عمودٌ فيه. وقرارُ صاحب المنصّة: جدولٌ لكلّ منطقةٍ ولو بمحطةٍ واحدة.
 *
 *  و`prefer` مناطقُ القارئ: تُرفع ولا يُحجب غيرُها. */
export function groupBoard(rows: BoardRow[], prefer: string[] = []): BoardGroup[] {
  const mine = new Set(prefer);
  const map = new Map<string, BoardGroup>();

  for (const r of rows) {
    const key = r.city ?? '';
    const g = map.get(key) ?? { city: r.city ?? null, rows: [], products: [] };
    g.rows.push(r);
    map.set(key, g);
  }

  for (const g of map.values()) {
    // محطاتُ المنصّة أوّلاً — طلبُ صاحب المنصّة — ثمّ ما وصل قبل ما يُنتظر
    // قبل ما نفد، ثمّ بالاسم.
    g.rows.sort(
      (a, b) =>
        Number(b.source === 'station') - Number(a.source === 'station') ||
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        a.name.localeCompare(b.name, 'ar')
    );
    g.products = [...new Set(g.rows.map((r) => r.product))];
  }

  return [...map.values()].sort(
    (a, b) =>
      // منطقةٌ مجهولةٌ آخراً دائماً، ثمّ مناطقُ القارئ، ثمّ الأكبرُ خبراً.
      Number(a.city === null) - Number(b.city === null) ||
      Number(mine.has(b.city ?? '')) - Number(mine.has(a.city ?? '')) ||
      b.rows.length - a.rows.length ||
      (a.city ?? '').localeCompare(b.city ?? '', 'ar')
  );
}
