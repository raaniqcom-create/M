'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadStations } from '@/lib/stations';
import { randomId } from '@/lib/uid';
import { FRESH_HOURS, WITHDRAW_HOURS, formatTime, isFresh, isOpenNow } from '@/lib/hours';
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
import type { FuelProduct, StationWithStatus } from '@/types/database';

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

/** وطولُ السكوت بالساعات، من أحدث ختمٍ على أيِّ منتج. */
function silentHours(s: StationWithStatus): number | null {
  const newest = s.products.reduce<string | null>(
    (a, r) => (r.updated_at && (!a || r.updated_at > a) ? r.updated_at : a),
    null
  );
  if (!newest) return null; // لم تنشر قطّ
  return (Date.now() - new Date(newest).getTime()) / 3600_000;
}

type State = 'announcing' | 'empty' | 'stale' | 'silent' | 'never' | 'closed';

const STATE_LABEL: Record<State, string> = {
  announcing: 'تعلن وقوداً',
  empty: 'مفتوحة بلا وقود',
  stale: 'خبرها شاخ',
  silent: 'ساكتة',
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
/** الأسوأُ أوّلاً: من لم ينشر قطّ، ثمّ الساكت، ثمّ الشائخ. */
const STATE_RANK: Record<State, number> = {
  never: 0, silent: 1, stale: 2, empty: 3, closed: 4, announcing: 5,
};

export function BranchBoard() {
  const [stations, setStations] = useState<StationWithStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState<string>('');
  const [filter, setFilter] = useState<FuelProduct | null>(null);

  const load = useCallback(async () => {
    try {
      setStations(await loadStations());
      setFailed(false);
      setAt(
        new Date().toLocaleString('ar-IQ', {
          timeZone: 'Asia/Baghdad',
          weekday: 'long', day: 'numeric', month: 'long',
          hour: 'numeric', minute: '2-digit',
        })
      );
    } catch {
      setFailed(true);
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

  const rows = useMemo(() => {
    if (!stations) return [];
    return stations
      .map((s) => {
        const open = isOpenNow(s);
        const available = PRODUCT_ORDER.filter((p) =>
          isOffered(s, s.products.find((r) => r.product === p))
        );
        const hours = silentHours(s);
        const stale = s.products.some((r) => isStaleOffer(r));
        const state: State =
          hours === null ? 'never'
          : isSilent(s) ? 'silent'
          : available.length ? 'announcing'
          : stale ? 'stale'
          : open ? 'empty'
          : 'closed';
        return { s, open, available, hours, state };
      })
      .sort(
        (a, b) =>
          STATE_RANK[a.state] - STATE_RANK[b.state] ||
          (b.hours ?? 1e9) - (a.hours ?? 1e9) ||
          a.s.name.localeCompare(b.s.name, 'ar')
      );
  }, [stations]);

  const sum = useMemo(() => {
    const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
    const covered = new Set(rows.map((r) => r.s.city));
    return {
      total: rows.length,
      announcing: n((r) => r.state === 'announcing'),
      silent: n((r) => r.state === 'silent' || r.state === 'never'),
      long: n((r) => (r.hours ?? 1e9) >= WITHDRAW_HOURS),
      covered: covered.size,
      uncovered: (CITY_NAMES as readonly string[]).filter((c) => !covered.has(c)),
    };
  }, [rows]);

  const byCity = useMemo(() => {
    const m = new Map<string, { total: number; announcing: number; silent: number }>();
    for (const r of rows) {
      const e = m.get(r.s.city) ?? { total: 0, announcing: 0, silent: 0 };
      e.total++;
      if (r.state === 'announcing') e.announcing++;
      if (r.state === 'silent' || r.state === 'never') e.silent++;
      m.set(r.s.city, e);
    }
    return (CITY_NAMES as readonly string[])
      .filter((c) => m.has(c))
      .map((c) => ({ city: c, ...m.get(c)! }));
  }, [rows]);

  if (failed) {
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
      {/* الطباعةُ بالمتصفّح لا برسمٍ على canvas: الوجهةُ ورقةٌ في ملفّ الفرع،
          والجدولُ HTML حقيقيّ. ولا مكتبةَ ولا سطرَ بناء. */}
      <style>{`
        @media print {
          body { background: #fff }
          .branch-hide, header, nav, footer { display: none !important }
          .branch .card { box-shadow: none; border-color: #d7e3dc; break-inside: avoid }
          .branch table { font-size: 9pt }
          .branch tr { break-inside: avoid }
          @page { size: A4; margin: 12mm }
        }
      `}</style>

      <section className="card p-5">
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
            <button
              type="button"
              onClick={() => window.print()}
              className="branch-hide btn-ghost mt-1 px-3 py-1.5 text-[11.5px]"
            >
              طباعة تقرير اليوم
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['محطة مسجّلة', sum.total, 'text-brand-900'],
            ['تعلن وقوداً الآن', sum.announcing, 'text-brand'],
            [`ساكتة أكثر من ${FRESH_HOURS} ساعة`, sum.silent, 'text-traffic-red'],
            [`ومنها فوق ${WITHDRAW_HOURS} ساعة`, sum.long, 'text-traffic-red'],
          ].map(([label, n, cls]) => (
            <div key={String(label)} className="rounded-xl bg-brand-50/60 p-3">
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

      <section className="card p-5">
        <h2 className="text-sm font-bold">المدن</h2>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] text-slate-500">
              <th className="p-1.5 text-right font-bold">المدينة</th>
              <th className="p-1.5 text-center font-bold">مسجّلة</th>
              <th className="p-1.5 text-center font-bold">تعلن الآن</th>
              <th className="p-1.5 text-center font-bold">ساكتة</th>
            </tr>
          </thead>
          <tbody>
            {byCity.map((c) => (
              <tr key={c.city} className="border-b border-slate-100">
                <td className="p-1.5 font-bold">{c.city}</td>
                <td className="p-1.5 text-center tabular-nums">{c.total}</td>
                <td className="p-1.5 text-center font-bold tabular-nums text-brand">{c.announcing}</td>
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
          كل المحطات <span className="font-normal text-slate-400">— الأسوأ أوّلاً</span>
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
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATE_CLASS[state]}`}>
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
          المقياس نفسه الذي يراه المواطن في التطبيق. و«ساكتة» = لم يُؤكَّد أيُّ منتجٍ منذ أكثر
          من {FRESH_HOURS} ساعة، فتسقط المحطة من نتائج البحث حتى يحدّثها صاحبها.
        </p>
      </section>
    </div>
  );
}
