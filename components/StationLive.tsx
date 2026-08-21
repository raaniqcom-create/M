'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCT_LABELS, PRODUCT_ORDER, expectedLabel } from '@/lib/products';
import { hoursLabel, isFresh, isOpenNow, PERIOD_LABELS } from '@/lib/hours';
import { agoLabel } from '@/lib/freshness';
import type { Station, StationProduct } from '@/types/database';

/** The two things on a station page that go stale the moment the page is built.
 *
 *  The site is a static export: every station page is HTML written at build
 *  time. Availability is the whole product — an owner flips بانزين محسن on and
 *  the page still reads «غير متوفر» until somebody pushes a commit. The first
 *  real station registered and hit exactly this: four products in stock in the
 *  database, seven «غير متوفر» on its own page, while the home list (which
 *  reads live) showed them correctly.
 *
 *  Opening hours have the same defect for a subtler reason: isOpenNow() reads
 *  the clock, so a build at 3am bakes «مغلقة الآن» into a page that will be
 *  served at noon.
 *
 *  So both are computed here, in the browser, from a live read. The build-time
 *  rows are still passed in and rendered first — they are usually right, and
 *  showing them immediately beats a spinner — then replaced when the fetch
 *  lands. The static HTML also remains the correct thing for a crawler to see.
 */
export function StationLive({
  station,
  initial,
}: {
  station: Station;
  initial: StationProduct[];
}) {
  const [rows, setRows] = useState<StationProduct[]>(initial);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    supabase
      .from('station_products')
      .select('*')
      .eq('station_id', station.id)
      .then(({ data }) => {
        if (alive && data) setRows(data as StationProduct[]);
      });

    // Only after mount, so the open/closed line is judged by the reader's clock
    // rather than the build server's.
    setNow(Date.now());

    // an owner flipping a product while someone is reading the page
    const channel = supabase
      .channel(`station-${station.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'station_products',
          filter: `station_id=eq.${station.id}`,
        },
        () => {
          supabase
            .from('station_products')
            .select('*')
            .eq('station_id', station.id)
            .then(({ data }) => {
              if (alive && data) setRows(data as StationProduct[]);
            });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [station.id]);

  const byProduct = new Map(rows.map((r) => [r.product, r]));
  // before mount, fall back to what the build believed
  const open = now === null ? false : isOpenNow(station);

  // أحدث قراءة، لا أقدمها — والحساب بعد وصول now كي لا يختلف ما يُبنى عمّا يُعرض.
  const newest = rows.reduce<string | null>(
    (a, r) => (r.updated_at && (!a || r.updated_at > a) ? r.updated_at : a),
    null
  );
  const lastUpdate = now === null ? null : agoLabel(newest);

  return (
    <>
      <h2 className="mt-5 text-sm font-bold">المنتجات</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {PRODUCT_ORDER.map((product) => {
          const row = byProduct.get(product);
          const expected = row?.expected_at ?? null;

          // حارس الحداثة — لم يكن هنا إطلاقاً.
          //
          // كان السطر `row?.is_available ?? false` بلا أي فحص لعمر الخبر، فصفحة
          // المحطة تعرض «متوفر» أخضرَ على إعلانٍ عمره ثلاثة أيام. والبطاقة في
          // الصفحة الرئيسة تحرسه منذ البداية — فالسطحان كانا يقولان شيئين
          // مختلفين عن المحطة نفسها، وأحدهما يكذب.
          //
          // ولا يُحذف المعلن القديم كما تفعل البطاقة: حذفه يُضيّع خبراً قد ينفع،
          // وعرضه أخضرَ يخدع. فيُقال ما أُعلن ومتى — والقارئ يقرّر.
          const claimed = row?.is_available ?? false;
          const fresh = claimed && isFresh(row?.updated_at);
          const inStock = fresh && open;
          const stale = claimed && !fresh;
          const staleAge = stale ? agoLabel(row?.updated_at) : null;

          return (
            <li key={product} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span>{PRODUCT_LABELS[product]}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  inStock
                    ? 'bg-brand-100 text-brand'
                    : expected
                      ? 'bg-amber-50 text-amber-700'
                      : stale
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-slate-100 text-slate-400'
                }`}
              >
                {inStock
                  ? 'متوفر'
                  : expected
                    ? `${expectedLabel(expected)}${row?.expected_period ? ` ${PERIOD_LABELS[row.expected_period]}` : ''}`
                    : stale
                      ? `آخر إعلان ${staleAge}`
                      : 'غير متوفر'}
              </span>
            </li>
          );
        })}
      </ul>

      {/* عمر الخبر، مكتوباً.
       *
       *  كانت الصفحة تعرض الحالة بلا وقتها، والثغرة تسدّها جملة «اتصل بالمحطة
       *  قبل أن تتحرك». وأكثر أصحاب المحطات يوقفون أرقامهم ليكون المنشور هو
       *  المرجع — وهو غرض المنصة — فلم يبقَ ما يسدّها. ومن يقف أمام قرار
       *  السفر إلى محطة يحتاج أن يعرف: هل هذا خبر هذه الساعة أم خبر أمس؟
       *
       *  ويُقاس بأحدث قراءة لا بأقدمها: المالك يضغط منتجاً واحداً حين يصله،
       *  فالأقدم يصف منتجاً لم يتغيّر لا خبراً مهملاً. */}
      {lastUpdate && (
        <p className="mt-3 text-xs text-slate-500">آخر تحديث للحالة {lastUpdate}</p>
      )}

      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {now === null
          ? `أوقات العمل ${hoursLabel(station)}`
          : open
            ? `مفتوحة الآن · ${hoursLabel(station)}`
            : `مغلقة الآن · أوقات العمل ${hoursLabel(station)}`}
      </p>
    </>
  );
}
