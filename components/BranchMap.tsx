'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PERIOD_LABELS, formatTime } from '@/lib/hours';
import { PRODUCT_LABELS } from '@/lib/products';
import { agoLabel } from '@/lib/freshness';
import { ANBAR_CENTER, ANBAR_ZOOM } from '@/lib/cities';
import type { BranchRow, State } from './BranchBoard';

/** أين يصل الوقود وأين لا يصل — على الأرض.
 *
 *  ── ولماذا محطةٌ محطة، لا دائرةٌ لكلّ قضاء ────────────────────────────────
 *
 *  الدائرةُ لكلّ قضاء أنظفُ بصريّاً بلا شكّ، لكنها تقرأ مراكزَ المدن من
 *  `lib/cities.ts` وتُهمل إحداثيَّ المحطة — فتُخفي المحطةَ التي تقع خارج
 *  محيطها. وصاحبُ المنصّة قال إنّ في الطريق توسّعاً خارج الأنبار وطلب إبقاء
 *  المحطة التي إحداثيُّها في بغداد. فخريطةٌ ترسم مراكزَ الأقضية تُخفي أوّلَ
 *  ثمرةِ ذلك التوسّع، وخريطةٌ ترسم المحطات تُظهره يومَ يقع.
 *
 *  وثمنُه معلومٌ ومقيس: أقربُ محطتين في الرمادي تبعدان ١٫٣٥ كم، وعلى مقياس
 *  المحافظة في هاتفٍ عرضُه ٣٧٥ بكسلاً تقع الأربعَ عشرةَ في بقعةٍ واحدة.
 *  ولذلك تُفتح الخريطةُ للتحريك والتكبير بزرٍّ صريح، والجدولُ تحتها يسمّي
 *  كلَّ محطةٍ بالاسم — فالخريطةُ تجيب «أين» والجدولُ يجيب «أيّها».
 *
 *  ── والتحريكُ مقفلٌ حتى يُطلَب ────────────────────────────────────────────
 *
 *  `scrollWheelZoom={false}` يعطّل عجلةَ الفأرة ولا يمسّ الإصبع: `dragging`
 *  مفعَّلٌ افتراضاً في ليفلت، فسحبةٌ تبدأ فوق الخريطة تُحرّك الخريطةَ لا
 *  الصفحة — وهي لوحةٌ طويلةٌ تُقرأ على هاتف. فيُقفل الكلُّ حتى يُضغط الزرّ.
 *
 *  ── ولا تُطبَع ───────────────────────────────────────────────────────────
 *
 *  بلاطاتُ ليفلت صورٌ تُجلب لِما ظهر، و`window.print()` يُطلَق فوراً. فالقسمُ
 *  كلُّه `branch-hide`، وما تقوله الخريطةُ من أرقامٍ محمولٌ إلى جدول «المدن»
 *  في الورقة — فلا يفقد التقريرُ شيئاً. */

/** ولا لونَ جديدٌ يدخل المنصّة: هذه ألوانُ الشارات في الجدول نفسِها. */
const PIN: Record<State, string> = {
  announcing: '#16a34a',
  empty: '#94a3b8',
  stale: '#d97706',
  silent: '#dc2626',
  never: '#dc2626',
  closed: '#94a3b8',
};

/** والأحمرُ هنا يقول «لا خبر» لا «لا وقود» — والفرقُ إداريٌّ كامل: محطةٌ
 *  مغلقةٌ الساعةَ الثانيةَ فجراً ليست نقصاً، ومحطةٌ لم تنطق منذ يومين مجهولة.
 *  ولذلك نصُّ المفتاح «لم تُحدِّث» لا «لا وقود». */
const LEGEND: [string, string, boolean][] = [
  ['#16a34a', 'تعلن وقوداً الآن', false],
  ['#16a34a', 'توزيع معلن اليوم أو غداً', true],
  ['#d97706', 'أعلنت ولم تؤكّد', false],
  ['#94a3b8', 'مفتوحة بلا وقود · مغلقة الآن', false],
  ['#dc2626', 'لم تُحدِّث · لم تنشر قطّ', false],
];

/** الإطارُ يُحسب مرّةً واحدة عند التركيب.
 *
 *  ولا يُعاد: الاشتراكُ الحيّ في BranchBoard يُعيد الجلبَ عند كلِّ تبديلِ
 *  توفّرٍ في المحافظة، ولو أُعيد التأطيرُ معه لقفزت الخريطةُ تحت إصبع
 *  الموظّف وهو ينظر. */
function FitOnce({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 11 });
    setDone(true);
  }, [pts, map, done]);
  return null;
}

function Interactivity({ on }: { on: boolean }) {
  const map = useMap();
  useEffect(() => {
    for (const h of [map.dragging, map.touchZoom, map.doubleClickZoom, map.scrollWheelZoom]) {
      if (on) h.enable();
      else h.disable();
    }
  }, [on, map]);
  return null;
}

export default function BranchMap({ rows }: { rows: BranchRow[] }) {
  const [live, setLive] = useState(false);

  // إحداثيٌّ فارغ يرمي داخل latLngBounds، والنوعُ يَعِد بـnumber ولا يضمنه.
  const pts = useMemo(
    () => rows.filter((r) => Number.isFinite(r.s.lat) && Number.isFinite(r.s.lng)),
    [rows]
  );
  const bounds = useMemo(
    () => pts.map((r) => [r.s.lat, r.s.lng] as [number, number]),
    [pts]
  );

  return (
    <div>
      <MapContainer
        center={ANBAR_CENTER}
        zoom={ANBAR_ZOOM}
        dragging={false}
        touchZoom={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        className="h-[320px] w-full rounded-2xl"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitOnce pts={bounds} />
        <Interactivity on={live} />

        {pts.map((r) => {
          const color = PIN[r.state];
          // الوعدُ حلقةٌ مفرّغة لا لونٌ سادس: «يوزّع الآن» و«وعد بتوزيع» حالتان
          // من جنسٍ واحد، والفرقُ بينهما زمنٌ لا نوع. والملءُ يُقرأ بلا لون،
          // فيبقى التمييزُ قائماً في التدرّج الرماديّ ولمن لا يميّز الألوان.
          const ring = r.due && r.state !== 'announcing';
          return (
            <CircleMarker
              key={r.s.id}
              center={[r.s.lat, r.s.lng]}
              // التراتبُ بالحجم لا باللون وحدَه: الخبرُ المطلوب — أين يصل
              // الوقود — يكبر، وما عداه يصغر. ولولاه لزاحم ثمانيةَ عشرَ أحمرَ
              // ثلاثةً خضراً فقُرئت الخريطةُ نعياً لا دليلاً.
              radius={r.state === 'announcing' || ring ? 8 : r.state === 'stale' ? 5 : 4}
              pathOptions={
                ring
                  ? { color: '#16a34a', weight: 3, fillColor: '#fff', fillOpacity: 1 }
                  : { color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }
              }
            >
              <Popup>
                <b className="block text-[12.5px] font-extrabold">{r.s.name.trim()}</b>
                <span className="text-[11px] text-slate-500">{r.s.city}</span>
                <span
                  className="mt-1 block text-[11.5px] font-bold"
                  style={{ color: ring ? '#16a34a' : color }}
                >
                  {ring ? 'توزيع معلن' : r.label}
                  {r.state === 'closed' && !r.s.is_24h && !r.s.temp_closed
                    ? ` · تفتح ${formatTime(r.s.opens_at)}`
                    : ''}
                </span>
                {r.available.length > 0 && (
                  <span className="mt-0.5 block text-[11.5px] text-brand">
                    {r.available.map((p) => PRODUCT_LABELS[p]).join(' · ')}
                  </span>
                )}
                {r.dueLines.map((l) => (
                  <span key={l} className="mt-0.5 block text-[11.5px] text-amber-800">
                    {l}
                  </span>
                ))}
                <span className="mt-0.5 block text-[10.5px] text-slate-400">
                  {r.hours === null ? 'لم تنشر بعد' : `آخر تحديث ${agoLabel(r.newest)}`}
                </span>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* بلا مفتاحٍ يبقى اللونُ زينةً — وهو هنا معلومة. (نمط RoadMap) */}
      <ul className="road-legend">
        {LEGEND.map(([c, text, hollow]) => (
          <li key={text}>
            <i
              className="road-legend__dot"
              style={
                hollow
                  ? { background: '#fff', boxShadow: `0 0 0 2px ${c}` }
                  : { background: c }
              }
            />
            {text}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setLive((v) => !v)}
        className="btn-ghost mt-1 w-full px-3 py-1.5 text-[11.5px]"
      >
        {live ? 'تثبيت الخريطة' : 'تحريك الخريطة وتكبيرها'}
      </button>
    </div>
  );
}
