'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import { PRODUCT_LABELS, TRAFFIC_LABELS } from '@/lib/products';
import type { StationWithStatus, TrafficLevel } from '@/types/database';

import { ANBAR_CENTER, ANBAR_ZOOM } from '@/lib/cities';

const PIN_COLOR: Record<'green' | 'yellow' | 'red' | 'none', string> = {
  green: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
  none: '#94a3b8',
};

// Leaflet's default marker pulls PNGs from a CDN path that breaks under
// bundlers — a divIcon avoids the asset problem and colours by traffic level.
function pinIcon(level: TrafficLevel | null, hasFuel: boolean) {
  const color = PIN_COLOR[level ?? 'none'];
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
    html: `<div style="position:relative;width:30px;height:30px">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
          <circle cx="12" cy="10" r="3" fill="white" stroke="none"/>
        </svg>
      </div>
      ${
        hasFuel
          ? `<span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#16a34a;border:2px solid #fff"></span>`
          : ''
      }
    </div>`,
  });
}

function FitToStations({ stations }: { stations: StationWithStatus[] }) {
  const map = useMap();
  useEffect(() => {
    if (stations.length === 0) return;
    map.fitBounds(
      L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number])).pad(0.25),
      { maxZoom: 14 }
    );
  }, [stations, map]);
  return null;
}

export default function StationMap({
  stations,
  onSelect,
}: {
  stations: StationWithStatus[];
  onSelect: (id: string) => void;
}) {
  return (
    <MapContainer
      center={ANBAR_CENTER}
      zoom={ANBAR_ZOOM}
      scrollWheelZoom
      className="h-[60vh] w-full rounded-2xl"
      style={{ zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToStations stations={stations} />

      {stations.map((s) => {
        const level = s.manual_traffic_level ?? s.traffic?.majority_level ?? null;
        const available = s.products.filter((p) => p.is_available);
        return (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon(level, available.length > 0)}>
            <Popup>
              <div className="min-w-[180px] text-right">
                <p className="text-sm font-bold text-slate-900">{s.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{s.address}</p>
                <p className="mt-1.5 text-xs font-semibold text-brand">
                  {available.length
                    ? available.map((p) => PRODUCT_LABELS[p.product]).join(' · ')
                    : 'لا يوجد وقود متوفر'}
                </p>
                {level && (
                  <p className="mt-1 text-xs text-slate-600">الازدحام: {TRAFFIC_LABELS[level]}</p>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="mt-2 w-full rounded-lg bg-brand py-1.5 text-xs font-semibold text-white"
                >
                  التفاصيل
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
