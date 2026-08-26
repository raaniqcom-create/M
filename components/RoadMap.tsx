'use client';

import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvent,
} from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import type { LatLng, RoadRoute, RouteStop } from '@/lib/geo';
import { RouteButton } from './RouteButton';

/** يؤطّر المسار كاملاً — لا مركزاً وتقريباً يُخمَّنان. */
function Fit({ path }: { path: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (path.length < 2) return;
    map.fitBounds(L.latLngBounds(path.map((p) => [p[0], p[1]] as [number, number])).pad(0.14));
  }, [map, path]);
  return null;
}

export interface GapSpan {
  fromKm: number;
  toKm: number;
  km: number;
}

/** خطٌّ يتدرّج من الأخضر إلى الأزرق.
 *
 *  التدرّج ليس زينة: يقول للعين أين أنت من الرحلة بلا أن تقرأ رقماً. أخضرُ
 *  الانطلاق يصير أزرقَ الوصول، فيُقرأ الاتجاه من اللون وحده.
 *
 *  وLeaflet لا يعرف التدرّج في خطٍّ واحد، فالمسار يُقطَّع ويُلوَّن كل جزء
 *  بلونٍ محسوب. */
function lerpColor(t: number): string {
  const a = [22, 163, 74]; // #16a34a أخضر المنصّة
  const b = [37, 99, 235]; // #2563eb
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function disc(html: string, cls = '', size = 26): L.DivIcon {
  return L.divIcon({
    className: 'road-pin',
    html: `<span class="road-pin__disc ${cls}"><span class="road-pin__num">${html}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, 13],
  });
}

function endIcon(kind: 'from' | 'to', label: string) {
  return L.divIcon({
    className: 'road-pin',
    html: `<span class="road-end road-end--${kind}"><span class="road-end__label">${label}</span></span>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

/** **التجميع بالمرساة، لا بالسابق.**
 *
 *  ثمانٍ وعشرون محطةً على الفلوجة ← القائم تتلاصق كلّها عند التقريب الذي
 *  يؤطّر الرحلة. فالتزاحم ليس حالةً نادرة بل **الحالة الأولى** لكل رحلةٍ
 *  طويلة.
 *
 *  والمقارنة بأوّل المجموعة لا بسابقها: قِيس فقياسُ السابق يبتلع الثماني
 *  والعشرين في عنقودٍ واحد — كلٌّ قريبٌ من جاره، والسلسلةُ تمتدّ بلا حدّ.
 *
 *  والقرص يحمل **مداه** — «٤–١١» لا «٨ محطات» — فيبقى الجسر إلى البطاقات
 *  المرقّمة أسفل الخريطة قائماً حتى وهي مجموعة. */
function useClusters(stops: RouteStop[]) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  // الإزاحة لا تُغيّر المسافات بين النقاط في مستوى الطبقة — فالتحريك لا
  // يُعيد التجميع، والتقريب وحده يفعل.
  useMapEvent('zoomend', () => setZoom(map.getZoom()));

  return useMemo(() => {
    void zoom;
    if (!stops.length) return [];
    const pts = stops.map((s) => map.latLngToLayerPoint([s.lat, s.lng]));
    // 38 لا 30: قرصُ المدى «22–27» أعرض من قرصِ الرقم — قِيس فتلاصقت
    // مجموعتان على الفلوجة ← القائم عند 30.
    const MIN = 38;
    const groups: number[][] = [];
    pts.forEach((p, i) => {
      const g = groups[groups.length - 1];
      if (g && p.distanceTo(pts[g[0]]) < MIN) g.push(i);
      else groups.push([i]);
    });
    return groups;
  }, [stops, map, zoom]);
}

/** **الأكبر يفوز بالمكان.**
 *
 *  الرمادي ← طريبيل فيها أربع فجوات: 43 و88 و74 و196. وعند التقريب الذي
 *  يؤطّر 435 كيلومتراً تتراكب أحكامها الأربعة في بقعةٍ واحدة، فلا يُقرأ
 *  منها شيء — والحكم الذي لا يُقرأ أسوأ من غيابه.
 *
 *  فتُرتَّب بالطول تنازلياً وتُوضع بالترتيب، ويُطوى ما وقع في سبعين نقطةً
 *  من موضوعٍ قبله. فالمئة والستّ والتسعون تظهر دائماً، والثلاث والأربعون
 *  تنتظر تقريباً يفرّقها. وكلّها في البطاقات أسفل الخريطة على كل حال. */
function GapBadges({
  lines,
  gaps,
  stops,
  groups,
}: {
  lines: LatLng[][];
  gaps: GapSpan[];
  stops: RouteStop[];
  groups: number[][];
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvent('zoomend', () => setZoom(map.getZoom()));

  const shown = useMemo(() => {
    void zoom;
    // الأقراص وُضعت أوّلاً — فهي المحجوزة، والحكم يتنحّى عنها لا العكس:
    // القرص يُنقر ليفتح المحطة، والحكم لا يُنقر أصلاً.
    const taken: L.Point[] = groups.map((g) =>
      map.latLngToLayerPoint([stops[g[0]].lat, stops[g[0]].lng])
    );
    const cand = gaps
      .map((g, i) => ({ g, pts: lines[i] }))
      .filter((c) => c.pts && c.pts.length > 1)
      .map((c) => ({ ...c, at: c.pts[Math.floor(c.pts.length / 2)] }))
      .sort((a, b) => b.g.km - a.g.km);
    const out: typeof cand = [];
    for (const c of cand) {
      const p = map.latLngToLayerPoint([c.at[0], c.at[1]]);
      // الحكم أعرض من القرص بكثير، فيلزمه مدىً أوسع
      if (taken.some((q, i) => q.distanceTo(p) < (i < groups.length ? 62 : 78))) continue;
      taken.push(p);
      out.push(c);
    }
    return out;
  }, [lines, gaps, stops, groups, map, zoom]);

  return (
    <>
      {shown.map((c, i) => (
        <Marker
          key={`gl${i}`}
          position={c.at as [number, number]}
          interactive={false}
          zIndexOffset={500}
          icon={L.divIcon({
            className: '',
            iconSize: [0, 0],
            html: `<span class="road-gap">${Math.round(c.g.km)} كم بلا محطة</span>`,
          })}
        />
      ))}
    </>
  );
}

function Stops({ stops, groups }: { stops: RouteStop[]; groups: number[][] }) {
  const map = useMap();

  return (
    <>
      {groups.map((g) => {
        const first = stops[g[0]];
        if (g.length === 1) {
          return (
            <Marker
              key={`s${g[0]}`}
              position={[first.lat, first.lng]}
              icon={disc(String(g[0] + 1), first.side > 0 ? 'road-pin__disc--left' : '')}
              title={first.name}
            >
              <Popup>
                <b className="text-[12.5px]">{first.name}</b>
                <br />
                <span className="text-[11px] text-slate-600">
                  {first.city} · كم {Math.round(first.atKm)} · {first.offRoadM} م عن الطريق
                </span>
                <br />
                <span className="text-[11px] font-bold">
                  {first.side > 0 ? 'يسار اتجاهك' : 'يمين اتجاهك'}
                </span>
                <div className="mt-1.5">
                  <RouteButton lat={first.lat} lng={first.lng} stationName={first.name} />
                </div>
              </Popup>
            </Marker>
          );
        }
        const last = g[g.length - 1];
        return (
          <Marker
            key={`g${g[0]}`}
            position={[first.lat, first.lng]}
            icon={disc(`${g[0] + 1}–${last + 1}`, 'road-pin__disc--run', 34)}
            zIndexOffset={300}
            title={`${g.length} محطات — اضغط لتفريقها`}
            eventHandlers={{
              click: () =>
                map.fitBounds(
                  L.latLngBounds(
                    g.map((i) => [stops[i].lat, stops[i].lng] as [number, number])
                  ).pad(0.3)
                ),
            }}
          />
        );
      })}
    </>
  );
}

/** الأقراص والأحكام معاً: تجميعٌ واحد يخدم الاثنين، فلا يتراكبان. */
function Layers({
  stops,
  lines,
  gaps,
}: {
  stops: RouteStop[];
  lines: LatLng[][];
  gaps: GapSpan[];
}) {
  const groups = useClusters(stops);
  return (
    <>
      <Stops stops={stops} groups={groups} />
      <GapBadges lines={lines} gaps={gaps} stops={stops} groups={groups} />
    </>
  );
}

export default function RoadMap({
  route,
  stops,
  gaps,
}: {
  route: RoadRoute;
  stops: RouteStop[];
  gaps: GapSpan[];
}) {
  const path = route.path;

  // أربعون قطعة تكفي لتدرّجٍ ناعم على شاشة هاتف، ولا تُثقل الرسم.
  const chunks = useMemo(() => {
    const size = Math.max(2, Math.ceil(path.length / 40));
    const out: { pts: LatLng[]; t: number }[] = [];
    for (let i = 0; i < path.length - 1; i += size - 1) {
      const pts = path.slice(i, Math.min(i + size, path.length));
      if (pts.length > 1) out.push({ pts, t: i / Math.max(1, path.length - 1) });
    }
    return out;
  }, [path]);

  /** الفجوة تُقصّ من المسار بالمسافة **على الطريق** — لا بالخطّ المستقيم. */
  const gapLines = useMemo(() => {
    const acc = [0];
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      const x = rad(b[0] - a[0]), y = rad(b[1] - a[1]);
      const q =
        Math.sin(x / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(y / 2) ** 2;
      acc.push(acc[i - 1] + 2 * R * Math.asin(Math.sqrt(q)));
    }
    return gaps.map((g) => path.filter((_, i) => acc[i] >= g.fromKm && acc[i] <= g.toKm));
  }, [path, gaps]);

  if (path.length < 2) return null;

  return (
    <div className="road-map-wrap">
      <MapContainer
        center={[path[0][0], path[0][1]]}
        zoom={8}
        scrollWheelZoom={false}
        className="h-[320px] w-full rounded-2xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit path={path} />

        {/* غلافٌ داكن تحت الخطّ: على بلاطٍ فاتحٍ مزدحم يذوب الخطّ الرفيع */}
        <Polyline
          positions={path.map((p) => [p[0], p[1]] as [number, number])}
          pathOptions={{ color: '#0f172a', weight: 9, opacity: 0.8 }}
        />

        {chunks.map((c, i) => (
          <Polyline
            key={`c${i}`}
            positions={c.pts.map((p) => [p[0], p[1]] as [number, number])}
            pathOptions={{ color: lerpColor(c.t), weight: 5, opacity: 1 }}
          />
        ))}

        {/* الفجوة: القارُ يُمحى ويحلّ محلّه أثرٌ متقطّعٌ نادر. ندرةُ الشرطات
            هي المعنى — كثافتُها تقول «طريق»، وندرتُها «لا شيء هنا». */}
        {gapLines.map((pts, i) =>
          pts.length > 1 ? (
            <Polyline
              key={`gb${i}`}
              positions={pts.map((p) => [p[0], p[1]] as [number, number])}
              pathOptions={{ color: '#ffffff', weight: 11, opacity: 1 }}
            />
          ) : null
        )}
        {gapLines.map((pts, i) =>
          pts.length > 1 ? (
            <Polyline
              key={`g${i}`}
              positions={pts.map((p) => [p[0], p[1]] as [number, number])}
              pathOptions={{ color: '#dc2626', weight: 3.5, opacity: 1, dashArray: '2 14' }}
            />
          ) : null
        )}

        <Layers stops={stops} lines={gapLines} gaps={gaps} />

        {/* حكمُ الفجوة مكتوبٌ دائماً، لا تلميحةَ مرور: أهمُّ رقمٍ في الصفحة
            لا يُراهن على إصابة خطٍّ رفيع بإبهامٍ في سيارة. */}
        {/* الطرفان: أخضرُ الانطلاق وأزرقُ الوصول، وباسميهما */}
        <CircleMarker
          center={[path[0][0], path[0][1]]}
          radius={9}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }}
        />
        <Marker
          position={[path[0][0], path[0][1]]}
          icon={endIcon('from', route.from)}
          zIndexOffset={1000}
          interactive={false}
        />
        <CircleMarker
          center={[path[path.length - 1][0], path[path.length - 1][1]]}
          radius={9}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
        />
        <Marker
          position={[path[path.length - 1][0], path[path.length - 1][1]]}
          icon={endIcon('to', route.to)}
          zIndexOffset={1000}
          interactive={false}
        />
      </MapContainer>

      {/* مفتاحُ الخريطة. بلا مفتاحٍ يبقى اللون زينةً — وهو هنا معلومة. */}
      <ul className="road-legend">
        <li>
          <i className="road-legend__dot" style={{ background: '#16a34a' }} />
          الانطلاق
        </li>
        <li>
          <i className="road-legend__dot" style={{ background: '#2563eb' }} />
          الوجهة
        </li>
        <li>
          <i className="road-legend__num">7</i>
          محطة يمين اتجاهك
        </li>
        <li>
          <i className="road-legend__num road-legend__num--left">7</i>
          يسارك — تحتاج التفافاً
        </li>
        {gaps.length > 0 && (
          <li>
            <i className="road-legend__gap" />
            طريقٌ بلا محطة نعرفها
          </li>
        )}
      </ul>
    </div>
  );
}
