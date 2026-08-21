'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadStations } from '@/lib/stations';
import { formatTime, isFresh, isOpenNow } from '@/lib/hours';
import { agoLabel } from '@/lib/freshness';
import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  activeTrafficLevel,
} from '@/lib/products';
import { CITY_NAMES } from '@/lib/cities';
import { SpinnerIcon } from './icons';
import type { StationWithStatus } from '@/types/database';

/** جدولٌ يُلتقط بصورة ويُنشر حيث يسأل الناس «أين يتوفر البانزين؟».
 *
 *  ليس لوحة إدارة بل منشوراً: يُقرأ في مجموعة واتساب على هاتف، بعيداً عن
 *  التطبيق وعن أي سياق يشرحه. فثلاثة قيود تحكم شكله:
 *
 *  · يحمل وقته بنفسه. صورةٌ بلا تاريخ تُعاد مشاركتها بعد يومين فتصير كذباً لا
 *    أحد قصده — والقارئ لا يملك ما يكشف به قِدَمها.
 *  · ويعرض كل المحطات المعتمدة لا أصحاب الوقود وحدهم: من يقرأ «لا يوجد» عن
 *    محطة قريبة عرف أن المنصّة تغطّيها وأنها فارغة اليوم، لا مجهولة.
 *  · ويحترم isFresh كما يحترمها التطبيق. صورةٌ تُعلن بانزيناً نفد قبل يومين
 *    تُرسل الناس إلى طابور لا وقود فيه، وتُنسب الخسارة إلى المنصّة لا إلى
 *    المحطة. فما يُنشر هو ما يراه المستخدم في تطبيقه، حرفاً بحرف. */
export function AvailabilityBoard() {
  const [stations, setStations] = useState<StationWithStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [city, setCity] = useState<string | null>(null);
  // يُحسب مرة عند الفتح لا في كل رسم: الجدول يُلتقط، ووقتٌ يتغيّر تحت اللقطة
  // يجعل الصورة تحمل لحظة غير التي قُرئت فيها.
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  useEffect(() => {
    loadStations()
      .then(setStations)
      .catch(() => setFailed(true));
    setOpenedAt(
      new Intl.DateTimeFormat('ar-IQ', {
        timeZone: 'Asia/Baghdad',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date())
    );
  }, []);

  const rows = useMemo(() => {
    if (!stations) return [];
    return stations
      .filter((s) => !city || s.city === city)
      .map((s) => {
        const open = isOpenNow(s);
        // نفس شرط بطاقة المستخدم حرفاً: متوفر، وحديث، والمحطة مفتوحة.
        const available = PRODUCT_ORDER.filter((p) => {
          const row = s.products.find((r) => r.product === p);
          return !!row?.is_available && isFresh(row.updated_at) && open;
        });
        // والمعلن القديم يُذكر بعمره لا يُطوى.
        //
        // بركة الرحمن تعلن بانزيناً محسناً عمره ٢٨ ساعة. طيُّه يجعل الجدول
        // يقول «لا يوجد» بينما بطاقتها في التطبيق تقول «بانزين محسن · قبل
        // يوم» — والجدول يُنشر باسم المنصّة، فتناقضه معها يُكذّبها. وإظهاره
        // أخضرَ يُرسل الناس إلى وقود قد نفد. فيُذكر ومعه عمره، والقارئ يقرّر.
        const stale = open
          ? PRODUCT_ORDER.map((p) => s.products.find((r) => r.product === p))
              .filter((r) => !!r?.is_available && !isFresh(r.updated_at))
              .map((r) => ({ product: r!.product, age: agoLabel(r!.updated_at) }))
          : [];
        const newest = s.products.reduce<string | null>(
          (a, r) => (r.updated_at && (!a || r.updated_at > a) ? r.updated_at : a),
          null
        );
        return { s, open, available, stale, newest, level: activeTrafficLevel(s, s.traffic) };
      })
      .sort(
        (a, b) =>
          // CITY_NAMES مصفوفة as const، فأنواعها حرفية ومدينة المحطة نصّ عادي.
          // والترتيب بترتيب القائمة مقصود: الرمادي والفلوجة أولاً كما في كل
          // شرائح التطبيق، فالجدول المنشور يقرأ كما تعوّد الناس.
          (CITY_NAMES as readonly string[]).indexOf(a.s.city) -
            (CITY_NAMES as readonly string[]).indexOf(b.s.city) ||
          b.available.length - a.available.length ||
          a.s.name.localeCompare(b.s.name, 'ar')
      );
  }, [stations, city]);

  const withFuel = rows.filter((r) => r.available.length > 0).length;
  const cities = useMemo(
    () => (CITY_NAMES as readonly string[]).filter((c) => (stations ?? []).some((s) => s.city === c)),
    [stations]
  );

  if (failed) {
    return (
      <section className="card p-5">
        <p className="text-xs text-traffic-red">تعذّر تحميل المحطات. أعد فتح الصفحة.</p>
      </section>
    );
  }

  if (!stations) {
    return (
      <section className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {/* خارج اللقطة عمداً: أدواتٌ لك وحدك، فوق الإطار الذي سيُصوَّر. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCity(null)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            city === null ? 'bg-brand text-white' : 'bg-white text-brand-700 ring-1 ring-brand-100'
          }`}
        >
          كل الأنبار
        </button>
        {cities.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCity(city === c ? null : c)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              city === c ? 'bg-brand text-white' : 'bg-white text-brand-700 ring-1 ring-brand-100'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* الإطار المقصود باللقطة يبدأ هنا. */}
      <section className="card overflow-hidden">
        <div className="bg-brand px-4 py-3 text-center text-white">
          <h2 className="text-sm font-extrabold">جدول توفّر المنتجات النفطية</h2>
          <p className="mt-0.5 text-[11px] font-bold opacity-90">
            المحطة التقنية · {city ?? 'محافظة الأنبار'}
          </p>
          <p className="mt-1 text-[11px] opacity-80">{openedAt}</p>
        </div>

        <div className="px-4 pt-3">
          {/* العدّ للحديث وحده — وهو ما يعني القارئ: كم محطة يثق بخبرها الآن. */}
          <p className="text-[11px] font-bold text-slate-500">
            {withFuel === 0
              ? 'لا محطة تعلن وقوداً متوفراً الآن'
              : `${withFuel} من ${rows.length} محطة تعلن وقوداً متوفراً الآن`}
          </p>
        </div>

        <div className="px-4 pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="pb-2 text-start font-semibold">المحطة</th>
                <th className="pb-2 text-start font-semibold">المتوفّر الآن</th>
                <th className="pb-2 text-center font-semibold">آخر تحديث</th>
                <th className="pb-2 text-center font-semibold">تغلق</th>
                <th className="pb-2 text-center font-semibold">الازدحام</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, open, available, stale, newest, level }) => (
                <tr key={s.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pe-2">
                    <span className="block font-bold text-slate-700">{s.name}</span>
                    <span className="block text-[11px] text-slate-400">{s.city}</span>
                  </td>
                  <td className="py-2 pe-2">
                    {available.length > 0 && (
                      <span className="block font-bold text-brand">
                        {available.map((p) => PRODUCT_LABELS[p]).join(' · ')}
                      </span>
                    )}
                    {stale.map((t) => (
                      <span key={t.product} className="block text-[11px] text-slate-400">
                        {PRODUCT_LABELS[t.product]} · {t.age}
                      </span>
                    ))}
                    {available.length === 0 && stale.length === 0 && (
                      <span className="text-slate-400">لا يوجد</span>
                    )}
                  </td>
                  <td className="py-2 text-center text-slate-500">
                    {newest ? agoLabel(newest) : '—'}
                  </td>
                  <td className="py-2 text-center text-slate-500">
                    {s.temp_closed
                      ? 'مغلقة مؤقتاً'
                      : s.is_24h
                        ? '24 ساعة'
                        : open
                          ? formatTime(s.closes_at)
                          : `تفتح ${formatTime(s.opens_at)}`}
                  </td>
                  <td className="py-2 text-center">
                    {level ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
                        {TRAFFIC_LABELS[level]}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* الدعوة في آخر الصورة: من قرأ الجدول ووجده نافعاً هو أقرب الناس إلى
            تحميل التطبيق — والسؤال الذي دفعه إلى المجموعة يجيبه التطبيق في كل
            مرة بعدها بلا أن يسأل أحداً. */}
        <div className="border-t border-brand-100 bg-brand-50 px-4 py-3 text-center">
          <p className="text-xs font-extrabold text-brand-900">
            لا تسأل مرة أخرى — حمّل «المحطة التقنية»
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-900/80">
            يصلك إشعار فور توفّر الوقود في مدينتك · مجاناً وبلا حساب
          </p>
          <p className="mt-1.5 text-[11px] font-bold text-brand-800" dir="ltr">
            App Store · Google Play · muhta.online
          </p>
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-slate-400">
        الجدول يعرض ما يراه المستخدم في التطبيق حرفاً بحرف: بالأخضر ما أعلنته المحطة خلال
        ٢٤ ساعة وهي مفتوحة، وبالرمادي إعلانٌ أقدم مع عمره — لا يُطوى فيناقض التطبيق، ولا
        يُعرض أخضرَ فيُرسل الناس إلى وقود نفد. التقط صورة للإطار الأخضر وانشرها.
      </p>
    </div>
  );
}
