'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ANBAR_CITIES } from '@/lib/cities';
import { CheckIcon, MapPinIcon, SpinnerIcon } from './icons';

// Leaflet touches window at import time, so it can't be server-rendered
const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-brand-50">
      <SpinnerIcon className="h-5 w-5 text-brand" />
    </div>
  ),
});

export function LocationField({
  coords,
  onChange,
  city,
}: {
  coords: { lat: number; lng: number } | null;
  onChange: (c: { lat: number; lng: number } | null) => void;
  city?: string;
}) {
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const cityCentre = ANBAR_CITIES.find((c) => c.name === city);

  function useCurrentLocation() {
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setShowMap(true); // let them confirm or nudge the pin
      },
      () => {
        setLocating(false);
        setShowMap(true);
        setNote('تعذّر تحديد موقعك. اختر الموقع من الخريطة يدوياً.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          aria-pressed={showMap}
          className={`btn ${showMap ? 'bg-brand text-white' : 'btn-ghost'}`}
        >
          <MapPinIcon className="h-4 w-4" />
          اختر من الخريطة
        </button>
        <button type="button" onClick={useCurrentLocation} disabled={locating} className="btn-ghost">
          {locating ? <SpinnerIcon className="h-4 w-4" /> : <MapPinIcon className="h-4 w-4" />}
          موقعك الحالي
        </button>
      </div>

      {showMap && (
        <div className="mt-2">
          <MapPicker coords={coords} onPick={onChange} center={cityCentre} />
        </div>
      )}

      {coords && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand">
          <CheckIcon className="h-4 w-4" />
          تم تحديد الموقع
          <span dir="ltr" className="text-slate-400">
            ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})
          </span>
        </p>
      )}

      {note && <p className="mt-2 text-xs text-traffic-red">{note}</p>}
    </div>
  );
}
