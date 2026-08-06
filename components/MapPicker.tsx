'use client';

import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import { ANBAR_CENTER, ANBAR_ZOOM } from '@/lib/cities';

const pin = L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  html: `<svg width="34" height="34" viewBox="0 0 24 24" fill="#16a34a" stroke="white" stroke-width="1.5">
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
    <circle cx="12" cy="10" r="3" fill="white" stroke="none"/>
  </svg>`,
});

function ClickCapture({ onPick }: { onPick: (c: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

// Re-centres when the caller changes the value (e.g. after "my location"),
// without fighting the user's own panning.
function Recentre({ coords }: { coords: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.setView([coords.lat, coords.lng], Math.max(map.getZoom(), 15));
  }, [coords, map]);
  return null;
}

export default function MapPicker({
  coords,
  onPick,
  center,
}: {
  coords: { lat: number; lng: number } | null;
  onPick: (c: { lat: number; lng: number }) => void;
  center?: { lat: number; lng: number };
}) {
  const start: [number, number] = coords
    ? [coords.lat, coords.lng]
    : center
      ? [center.lat, center.lng]
      : ANBAR_CENTER;

  return (
    <div className="overflow-hidden rounded-xl border border-brand-100">
      <MapContainer
        center={start}
        zoom={coords || center ? 14 : ANBAR_ZOOM}
        scrollWheelZoom
        // Leaflet collapses without a definite height; set it inline rather
        // than depend on a utility class being generated
        style={{ height: '16rem', width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onPick={onPick} />
        <Recentre coords={coords} />
        {coords && <Marker position={[coords.lat, coords.lng]} icon={pin} />}
      </MapContainer>
      <p className="bg-brand-50 px-3 py-2 text-center text-xs font-medium text-brand-900">
        اضغط على الخريطة لتحديد موقع المحطة بدقة
      </p>
    </div>
  );
}
