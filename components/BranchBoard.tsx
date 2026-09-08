'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadCachedStations, loadStations } from '@/lib/stations';
import { randomId } from '@/lib/uid';
import { FRESH_HOURS, WITHDRAW_HOURS, formatTime, isFresh, isOpenNow, whenLabel } from '@/lib/hours';
import { agoLabel } from '@/lib/freshness';
import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  isOffered,
  isStaleOffer,
} from '@/lib/products';
import { CITY_NAMES } from '@/lib/cities';
import { ProductsDashboard } from './ProductsDashboard';
import { SpinnerIcon } from './icons';
import { StaleBanner } from './StaleBanner';
import type { FuelProduct, StationWithStatus } from '@/types/database';

// ليفلت يلمس window وقتَ الاستيراد، والمشروعُ تصديرٌ ساكن يُصيَّر في Node —
// فلا يُصدَّر ساكناً. (نمطُ components/RoadPlanner.tsx:25-32)
const BranchMap = dynamic(() => import('./BranchMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-2xl bg-brand-50">
      <SpinnerIcon className="h-6 w-6 text-brand" />
    </div>
  ),
});

/** لوحةُ متابعةٍ لفرع توزيع المنتجات النفطية — حالةُ المحافظة لحظةً بلحظة.
 *
 *  **وهي ليست `AvailabilityBoard`.** ذاك منشورٌ يُلتقط بصورة وتُرسل إلى مجموعة
 *  واتساب، فيعرض ما يفيد المواطن: أين الوقود الآن. وهذه أداةُ إشراف: ما يفيد
 *  الفرعَ هو **أين لا يُحدَّث** — أيُّ محطةٍ مسجّلةٍ سكتت، ومنذ متى. فالعمودان
 *  اللذان يهمّان هنا آخِرُ عمودَين هناك.
 *
 *  ولذلك لم يُفرَّع المكوّن ولم يُعلَّم بـ`variant`: عَلَمٌ في مكوّنٍ واحد
 *  يعني شرطاً في كلِّ صفّ، وغرضين يتنازعان كلَّ تعديلٍ بعده. والمُعاد
 *  استعمالُه هو المنطق لا الترميز — `loadStations` و`isOffered` و`isFresh`
 *  و`agoLabel`، وهي حيث تُقرَّر الحقيقة.
 *
 *  **وما تعرضه كلُّه مقروءٌ لغير المسجَّل أصلاً**: `stations_public` و
 *  `station_products` وجدولا الازدحام. فحارسُ الصفحة للمحاسبة والعرض لا
 *  للسرّيّة — ولا يُدّعى غيرُ ذلك. */

/** «سكتت» = لا منتجَ واحد أُكِّد خلال أربعٍ وعشرين ساعة.
 *
 *  المقياسُ نفسُه الذي يُسقط الأخضرَ عن بطاقة المواطن (`isFresh` في
 *  lib/hours.ts) — فما يراه الفرعُ سكوتاً هو ما يراه المواطنُ اختفاءً، ولا
 *  يقرأ السطحان رقمين مختلفين عن المحطة نفسِها. */
const isSilent = (s: StationWithStatus) => !s.products.some((p) => isFresh(p.updated_at));

/** «اليوم» بتوقيت بغداد لا بساعة الجهاز.
 *
 *  `expected_at` تاريخٌ مجرّد يكتبه صاحبُ المحطة بتقويم بلده، وموظّفٌ يفتح
 *  اللوحةَ من جهازٍ ضُبط على توقيتٍ آخر كان سيقرأ وعدَ اليوم وعدَ الأمس.
 *  و`en-CA` هي الصيغةُ الوحيدةُ التي تُخرج YYYY-MM-DD جاهزةً للمقارنة النصّية. */
const baghdadDate = (plusDays = 0) => {
  const d = new Date(Date.now() + plusDays * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
};

/** صفُّ اللوحة — تقرؤه الخريطةُ والجدولُ معاً فلا يفترقان.
 *
 *  ويُصدَّر نوعاً لا قيمةً، فيُمحى عند الترجمة ولا تنشأ دورةُ استيرادٍ مع
 *  `BranchMap` الذي يستورده. */
export type BranchRow = {
  s: StationWithStatus;
  open: boolean;
  available: FuelProduct[];
  hours: number | null;
  newest: string | null;
  state: State;
  label: string;
  /** أُعلن توزيعٌ لهذا اليوم أو غد — وهو «التوزيع» بمعناه المتداول: حدثٌ له
   *  موعد، لا حالةٌ آنيّة. ولا يمرّ على حارس الدوام، فيبقى مقروءاً ليلاً حين
   *  تكون المحافظةُ كلُّها مغلقة. */
  due: boolean;
  dueLines: string[];
};

/** وطولُ السكوت بالساعات، من أحدث ختمٍ على أيِّ منتج. */
function silentHours(s: StationWithStatus): number | null {
  const newest = s.products.reduce<string | null>(
    (a, r) => (r.updated_at && (!a || r.updated_at > a) ? r.updated_at : a),
    null
  );
  if (!newest) return null; // لم تنشر قطّ
  return (Date.now() - new Date(newest).getTime()) / 3600_000;
}

export type State = 'announcing' | 'empty' | 'stale' | 'silent' | 'never' | 'closed';

export const STATE_LABEL: Record<State, string> = {
  announcing: 'تعلن وقوداً',
  empty: 'مفتوحة بلا وقود',
  stale: 'أعلنت ولم تؤكّد',
  silent: 'لم تُحدِّث',
  never: 'لم تنشر قطّ',
  closed: 'مغلقة الآن',
};
const STATE_CLASS: Record<State, string> = {
  announcing: 'bg-brand-100 text-brand-900',
  empty: 'bg-slate-100 text-slate-600',
  stale: 'bg-amber-50 text-amber-800',
  silent: 'bg-red-50 text-traffic-red',
  never: 'bg-red-50 text-traffic-red',
  closed: 'bg-slate-100 text-slate-500',
};
/** الأحدثُ تحديثاً أوّلاً: من يعلن وقوداً الآن، فمن حدّث ولا وقودَ عنده، فمن
 *  أعلن ولم يؤكّد، وفي الذيل من لم يُحدِّث ومن لم ينشر قطّ.
 *
 *  والترتيبُ كان معكوساً — الأسوأ أوّلاً. وقلبُه قرارُ صاحب المنصّة: صفحةٌ
 *  تُفتح على العاملين لا على المتخلّفين، والمتخلّفُ في الذيل لا يضيع. */
const STATE_RANK: Record<State, number> = {
  announcing: 0, empty: 1, closed: 2, stale: 3, silent: 4, never: 5,
};

export function BranchBoard() {
  const [stations, setStations] = useState<StationWithStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState<string>('');
  const [filter, setFilter] = useState<FuelProduct | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const okAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStations(await loadStations());
      setFailed(false);
      setStaleAt(null);
      okAt.current = new Date().toISOString();
      setAt(
        new Date().toLocaleString('ar-IQ', {
          timeZone: 'Asia/Baghdad',
          weekday: 'long', day: 'numeric', month: 'long',
          hour: 'numeric', minute: '2-digit',
        })
      );
    } catch {
      setFailed(true);
      if (okAt.current) {
        setStaleAt(okAt.current);
        return;
      }
      const snap = loadCachedStations();
      if (snap) {
        setStations(snap.rows);
        setStaleAt(snap.at);
        setAt(
          new Date(snap.at).toLocaleString('ar-IQ', {
            timeZone: 'Asia/Baghdad',
            weekday: 'long', day: 'numeric', month: 'long',
            hour: 'numeric', minute: '2-digit',
          })
        );
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── لحظةً بلحظة ─────────────────────────────────────────────────────────
  //
  // اشتراكٌ حيّ على نمط app/page.tsx: أيُّ تبديلِ توفّرٍ يُعيد الجلب كاملاً بدل
  // دمج الحدث بيد. والفارقُ عن الصفحة الرئيسة أن تلك تراقب مدينةً واحدة وهذه
  // المحافظةَ كلَّها — فالإعادةُ أكثر، وهي مقبولة: أربعون محطةً في ردٍّ واحد.
  //
  // **واسمُ القناة فريد.** قناةٌ باسمٍ ثابت تعود بالنسخة نفسِها إن رُكّبت مرّتين،
  // فتسقط المستمعات صامتةً ويسكن الجدولُ بلا عطلٍ ظاهر (lib/useSiteStats.ts).
  useEffect(() => {
    const ch = supabase
      .channel(`branch-board:${randomId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_products' }, () => void load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stations' }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const rows = useMemo<BranchRow[]>(() => {
    if (!stations) return [];
    const today = baghdadDate();
    const tomorrow = baghdadDate(1);
    return stations
      .map((s) => {
        const open = isOpenNow(s);
        const available = PRODUCT_ORDER.filter((p) =>
          isOffered(s, s.products.find((r) => r.product === p))
        );
        const hours = silentHours(s);
        const newest = s.products.reduce<string | null>(
          (a, r) => (r.updated_at && (!a || r.updated_at > a) ? r.updated_at : a),
          null
        );
        const stale = s.products.some((r) => isStaleOffer(r));
        // وحدُّ الوعد يومان: في القاعدة اليومَ أربعةُ وعودٍ من آب لم تُنظَّف،
        // و`expectedLabel` تطبع لها «متوقع» عاريةً بلا تاريخ — فوعدُ ثمانٍ
        // وعشرين آب كان سيُرسم توزيعاً حيّاً على الخريطة.
        const dueRows = s.products.filter(
          (r) => r.expected_at === today || r.expected_at === tomorrow
        );
        const dueLines = dueRows.map((row) => {
          const r = { ...row, tail: whenLabel(row.expected_period, row.expected_time) };
          return (
            `${r.expected_at === today ? 'توزيع اليوم' : 'توزيع غداً'}: ` +
            PRODUCT_LABELS[r.product] +
            // والذيلُ من `whenLabel`: الساعةُ إن ذُكرت وإلّا الفترة. ولا
            // حارسَ تأخّرٍ هنا — `dueRows` فوقُ لا تقبل إلا اليومَ والغد.
            (r.tail ? ` — ${r.tail}` : '')
          );
        });
        const state: State =
          hours === null ? 'never'
          : isSilent(s) ? 'silent'
          : available.length ? 'announcing'
          : stale ? 'stale'
          : open ? 'empty'
          : 'closed';
        return {
          s, open, available, hours, newest, state,
          label: STATE_LABEL[state],
          due: dueRows.length > 0,
          dueLines,
        };
      })
      .sort(
        (a, b) =>
          STATE_RANK[a.state] - STATE_RANK[b.state] ||
          // والأحدثُ عهداً بالتحديث قبل الأقدم، داخل الحالة الواحدة
          (a.hours ?? 1e9) - (b.hours ?? 1e9) ||
          a.s.name.localeCompare(b.s.name, 'ar')
      );
  }, [stations]);

  const sum = useMemo(() => {
    const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
    const covered = new Set(rows.map((r) => r.s.city));
    return {
      total: rows.length,
      announcing: n((r) => r.state === 'announcing'),
      due: n((r) => r.due),
      open: n((r) => r.open),
      silent: n((r) => r.state === 'silent' || r.state === 'never'),
      long: n((r) => (r.hours ?? 1e9) >= WITHDRAW_HOURS),
      covered: covered.size,
      uncovered: (CITY_NAMES as readonly string[]).filter((c) => !covered.has(c)),
    };
  }, [rows]);

  const byCity = useMemo(() => {
    const m = new Map<string, { total: number; announcing: number; due: number; silent: number }>();
    for (const r of rows) {
      const e = m.get(r.s.city) ?? { total: 0, announcing: 0, due: 0, silent: 0 };
      e.total++;
      if (r.state === 'announcing') e.announcing++;
      if (r.due) e.due++;
      if (r.state === 'silent' || r.state === 'never') e.silent++;
      m.set(r.s.city, e);
    }
    return (CITY_NAMES as readonly string[])
      .filter((c) => m.has(c))
      .map((c) => ({ city: c, ...m.get(c)! }));
  }, [rows]);

  // **`failed` وحدَها كانت تمحو لوحةً محمَّلةً كاملة.** سقوطُ طلبِ تحديثٍ واحد
  // كان يُلغي تقريرَ المشرف الذي بين يديه ويستبدله بسطر خطأ. فلا يُمحى إلا إذا
  // لم يصل شيءٌ أصلاً؛ وما عدا ذلك يبقى معروضاً تحت شريط القِدَم.
  if (failed && !stations) {
    return (
      <section className="card p-5">
        <p className="text-xs font-bold text-traffic-red">تعذّر تحميل المحطات. أعد فتح الصفحة.</p>
      </section>
    );
  }
  if (!stations) {
    return (
      <div className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </div>
    );
  }

  return (
    <div className="branch space-y-4">
      {staleAt && stations && (
        <StaleBanner at={staleAt} onRetry={() => void load()} />
      )}

      {/* الطباعةُ بالمتصفّح لا برسمٍ على canvas: الوجهةُ ورقةٌ في ملفّ الفرع،
          والجدولُ HTML حقيقيّ. ولا مكتبةَ ولا سطرَ بناء. */}
      <style>{`
        @media print {
          html, body { background: #fff !important }
          .branch-hide, header, nav, footer { display: none !important }

          /* حاويةُ التمرير الأفقيّ تقصّ الورق: على الشاشة تُمرَّر، وعلى الورقة
             لا تمرير — فتُفتح، ويسقط عنها العرضُ الأدنى المفروض للهاتف. */
          .branch .overflow-x-auto { overflow: visible !important }
          .branch table { width: 100% !important; min-width: 0 !important;
                          font-size: 8.5pt; border-collapse: collapse }

          /* رأسُ الجدول يتكرّر في أعلى كلّ ورقة — وإلا قُرئ نصفُ التقرير بلا
             عناوين أعمدة، وهو أوّلُ ما يُلاحظ في ملفٍّ رسميّ. */
          .branch thead { display: table-header-group }
          .branch tr { break-inside: avoid; page-break-inside: avoid }
          .branch td, .branch th { padding: 3pt 4pt }

          /* **وهذا كان سببَ تداخل الصفحات.** « break-inside: avoid » على البطاقة
             يمنع انقسامها، وبطاقةُ «كل المحطات» أطولُ من ورقةٍ واحدة — فيدفع
             المتصفّحُ ما لا يسع خارجَ حدودها بدل أن يقلب الورقة. فالمنعُ يُرفع
             عن البطاقة ويُترك على الصفّ: تنقسم البطاقةُ عند حدود الصفوف. */
          .branch .card { box-shadow: none; border: 1px solid #d7e3dc;
                          break-inside: auto; padding: 8pt 10pt }
          .branch .card-atomic { break-inside: avoid; page-break-inside: avoid }
          .branch section + section { margin-top: 6pt }

          /* شارةُ الحالة لونُها هو معناها؛ ومتصفّحُ الطباعة يُسقط الخلفيات
             افتراضاً فتخرج بيضاء على بيضاء. */
          .branch .state-chip, .branch .stat-box {
            print-color-adjust: exact; -webkit-print-color-adjust: exact }

          @page { size: A4; margin: 14mm 12mm }
        }
      `}</style>

      <section className="card card-atomic p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-base font-extrabold text-brand-900">
              حالة توفّر الوقود — محافظة الأنبار
            </h1>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              لوحة متابعة لفرع شركة توزيع المنتجات النفطية · تُحدَّث لحظةً بلحظة
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11.5px] font-bold text-slate-600">{at}</p>
            {/* بابُ خروج. اللوحةُ تُفتح من رابطٍ مباشرٍ ومن القائمة، ولم يكن
                فيها ما يعود بالناظر إلى المنصّة — فيُغلق التبويبَ أو يضغط
                رجوعاً لا يعرف أين يقف. وكلاهما branch-hide: أزرارٌ لا معنى
                لها على الورق. */}
            <div className="branch-hide mt-1 flex items-center justify-end gap-2">
              <a href="/" className="btn-ghost px-3 py-1.5 text-[11.5px]">
                الرئيسة
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-ghost px-3 py-1.5 text-[11.5px]"
              >
                طباعة تقرير اليوم
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['محطة مسجّلة', sum.total, 'text-brand-900'],
            ['تعلن وقوداً الآن', sum.announcing, 'text-brand'],
            [`لم تُحدِّث منذ ${FRESH_HOURS} ساعة`, sum.silent, 'text-traffic-red'],
            [`ومنها فوق ${WITHDRAW_HOURS} ساعة`, sum.long, 'text-traffic-red'],
          ].map(([label, n, cls]) => (
            <div key={String(label)} className="stat-box rounded-xl bg-brand-50/60 p-3">
              <b className={`block text-2xl font-extrabold ${cls}`} dir="ltr">
                {String(n)}
              </b>
              <span className="text-[11px] font-bold text-slate-600">{label}</span>
            </div>
          ))}
        </div>

        {sum.uncovered.length > 0 && (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900">
            <b>{sum.covered}</b> مدينة فيها محطة مسجّلة، و<b>{sum.uncovered.length}</b> بلا تسجيل بعد:{' '}
            {sum.uncovered.join(' · ')}
          </p>
        )}
      </section>

      {/* المنتجاتُ في عموم المحافظة — المكوّن نفسه الذي يراه المواطن، بنطاقٍ
          مسمّى، فلا يقرأ الفرعُ رقماً يخالف ما في أيدي الناس. */}
      <ProductsDashboard
        stations={stations}
        filter={filter}
        onPick={setFilter}
        scopeLabel="عموم الأنبار"
      />

      {/* branch-hide: بلاطاتُ ليفلت صورٌ كسولةٌ و`window.print()` لا ينتظرها،
          فالخريطةُ تخرج نصفَ محمَّلةٍ على الورق. وأرقامُها محمولةٌ إلى جدول
          المدن أدناه، فلا تفقد الورقةُ شيئاً. */}
      <section className="card branch-hide p-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">أين يصل الوقود</h2>
          {/* السطرُ الذي يمنع سوءَ القراءة: الساعةَ الثانيةَ فجراً تكون
              المحافظةُ كلُّها مغلقةً بدوامها، فتُقرأ الخريطةُ الهادئةُ عطلاً
              ما لم يُقَل السببُ بلا شرطٍ ولا ذكاء. */}
          <p className="text-[11px] font-bold text-slate-500">
            المفتوح الآن <b className="text-brand-900">{sum.open}</b> من {sum.total} محطة
            بحسب دوامها المعلن
            {sum.due > 0 ? ` · و${sum.due} أعلنت توزيعاً لليوم أو غد` : ''}
          </p>
        </div>
        <BranchMap rows={rows} />
      </section>

      <section className="card card-atomic p-5">
        <h2 className="text-sm font-bold">المدن</h2>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] text-slate-500">
              <th className="p-1.5 text-right font-bold">المدينة</th>
              <th className="p-1.5 text-center font-bold">مسجّلة</th>
              <th className="p-1.5 text-center font-bold">تعلن الآن</th>
              <th className="p-1.5 text-center font-bold">توزيع معلن</th>
              <th className="p-1.5 text-center font-bold">لم تُحدِّث</th>
            </tr>
          </thead>
          <tbody>
            {byCity.map((c) => (
              <tr key={c.city} className="border-b border-slate-100">
                <td className="p-1.5 font-bold">{c.city}</td>
                <td className="p-1.5 text-center tabular-nums">{c.total}</td>
                <td className="p-1.5 text-center font-bold tabular-nums text-brand">{c.announcing}</td>
                <td className={`p-1.5 text-center tabular-nums ${c.due ? 'font-bold text-amber-700' : 'text-slate-400'}`}>
                  {c.due || '—'}
                </td>
                <td className={`p-1.5 text-center tabular-nums ${c.silent ? 'font-bold text-traffic-red' : 'text-slate-400'}`}>
                  {c.silent || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">
          كل المحطات <span className="font-normal text-slate-400">— الأحدث تحديثاً أوّلاً</span>
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                <th className="p-1.5 text-right font-bold">المحطة</th>
                <th className="p-1.5 text-right font-bold">المدينة</th>
                <th className="p-1.5 text-right font-bold">المتوفّر الآن</th>
                <th className="p-1.5 text-right font-bold">آخر تحديث</th>
                <th className="p-1.5 text-right font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, available, hours, state }) => (
                <tr key={s.id} className="border-b border-slate-100 align-top">
                  <td className="p-1.5 font-bold">{s.name.trim()}</td>
                  <td className="p-1.5 text-slate-500">{s.city}</td>
                  <td className="p-1.5">
                    {available.length ? (
                      <span className="text-brand">{available.map((p) => PRODUCT_LABELS[p]).join(' · ')}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`p-1.5 tabular-nums ${(hours ?? 1e9) >= FRESH_HOURS ? 'text-traffic-red' : 'text-slate-500'}`}>
                    {hours === null ? 'لم تنشر' : agoLabel(
                      s.products.reduce<string | null>(
                        (a, r) => (r.updated_at && (!a || r.updated_at > a) ? r.updated_at : a),
                        null
                      )
                    )}
                  </td>
                  <td className="p-1.5">
                    <span className={`state-chip rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATE_CLASS[state]}`}>
                      {STATE_LABEL[state]}
                      {state === 'closed' && !s.is_24h && !s.temp_closed
                        ? ` · تفتح ${formatTime(s.opens_at)}`
                        : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          «تعلن وقوداً» = منتجٌ متوفّر أُكِّد خلال {FRESH_HOURS} ساعة والمحطة مفتوحة الآن — وهو
          المقياس نفسه الذي يراه المواطن في التطبيق. و«أعلنت ولم تؤكّد» = قالت إنّ لديها
          وقوداً ثمّ مضى على قولها ما بين {FRESH_HOURS} و{WITHDRAW_HOURS} ساعة بلا إعادة
          تأكيد. و«لم تُحدِّث» = لم يُؤكَّد أيُّ منتجٍ منذ أكثر من {FRESH_HOURS} ساعة، فتسقط
          المحطة من نتائج البحث حتى يحدّثها صاحبها.
        </p>
      </section>
    </div>
  );
}
