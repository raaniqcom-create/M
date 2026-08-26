'use client';

import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, RouteStop } from '@/lib/geo';

/** يؤطّر المسار كاملاً — لا مركزاً وتقريباً يُخمَّنان. */
function Fit({ path }: { path: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (path.length < 2) return;
    map.fitBounds(L.latLngBounds(path.map((p) => [p[0], p[1]] as [number, number])).pad(0.12));
  }, [map, path]);
  return null;
}

/** خطٌّ يتدرّج من الأخضر إلى الأزرق — والفجوات حمراء فوقه.
 *
 *  التدرّج ليس زينة: يقول للعين أين أنت من الرحلة بلا أن تقرأ رقماً. أخضرُ
 *  الانطلاق يصير أزرقَ الوصول، فيُقرأ الاتجاه من اللون وحده.
 *
 *  وLeaflet لا يعرف التدرّج في خطٍّ واحد، فالمسار يُقطَّع ويُلوَّن كل جزء
 *  بلونٍ محسوب. والفجوات تُرسم فوقه أعرضَ وأحمر — فهي أهمّ ما فيه. */
function lerpColor(t: number): string {
  // #16a34a (أخضر المنصّة) → #2563eb (أزرق)
  const a = [22, 163, 74];
  const b = [37, 99, 235];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface GapSpan {
  fromKm: number;
  toKm: number;
  km: number;
}

export default function RoadMap({
  path,
  stops,
  gaps,
  distanceAt,
}: {
  path: LatLng[];
  stops: RouteStop[];
  gaps: GapSpan[];
  /** بُعد نقطةٍ على المسار عن الانطلاق — لتلوين الفجوات في مواضعها */
  distanceAt: (p: LatLng) => number;
}) {
  if (path.length < 2) return null;

  // أربعون قطعة تكفي لتدرّجٍ ناعم على شاشة هاتف، ولا تُثقل الرسم.
  const CHUNKS = 40;
  const size = Math.max(2, Math.ceil(path.length / CHUNKS));
  const chunks: { pts: LatLng[]; t: number }[] = [];
  for (let i = 0; i < path.length - 1; i += size - 1) {
    const pts = path.slice(i, Math.min(i + size, path.length));
    if (pts.length > 1) chunks.push({ pts, t: i / Math.max(1, path.length - 1) });
  }

  const gapLines = gaps.map((g) =>
    path.filter((p) => {
      const d = distanceAt(p);
      return d >= g.fromKm && d <= g.toKm;
    })
  );

  return (
    <MapContainer
      center={[path[0][0], path[0][1]]}
      zoom={8}
      scrollWheelZoom={false}
      className="h-[300px] w-full rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit path={path} />

      {chunks.map((c, i) => (
        <Polyline
          key={`c${i}`}
          positions={c.pts.map((p) => [p[0], p[1]] as [number, number])}
          pathOptions={{ color: lerpColor(c.t), weight: 5, opacity: 0.95 }}
        />
      ))}

      {gapLines.map((pts, i) =>
        pts.length > 1 ? (
          <Polyline
            key={`g${i}`}
            positions={pts.map((p) => [p[0], p[1]] as [number, number])}
            pathOptions={{ color: '#dc2626', weight: 8, opacity: 0.85, dashArray: '10 8' }}
          >
            <Tooltip sticky>{Math.round(gaps[i].km)} كم بلا محطة</Tooltip>
          </Polyline>
        ) : null
      )}

      {stops.map((s, i) => (
        <CircleMarker
          key={`s${i}`}
          center={[s.lat, s.lng]}
          radius={6}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }}
        >
          <Tooltip direction="top">{s.name}</Tooltip>
        </CircleMarker>
      ))}

      {/* الطرفان: أخضرُ الانطلاق وأزرقُ الوصول — نفسُ لغة الخطّ */}
      <CircleMarker
        center={[path[0][0], path[0][1]]}
        radius={8}
        pathOptions={{ color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }}
      />
      <CircleMarker
        center={[path[path.length - 1][0], path[path.length - 1][1]]}
        radius={8}
        pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
      />
    </MapContainer>
  );
}
