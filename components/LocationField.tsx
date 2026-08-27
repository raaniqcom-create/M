'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ANBAR_CITIES } from '@/lib/cities';
import { knownFuelNear, metresToKnownFuel, SUSPICIOUS_M } from '@/lib/nearbyFuel';
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

/** موضعُ المحطة — لا موضعُ صاحبها.
 *
 *  **الزرُّ كان يدعو إلى الخطأ.** كان مكتوباً عليه «موقعك الحالي»، وهو سؤالٌ
 *  عن الشخص لا عن المحطة — فسجّل أصحابُ محطاتٍ بيوتهم ومقاهيهم. والمراجعةُ
 *  لا تكشفه: عنوانٌ نصّيٌّ معقول ودبّوسٌ على الخريطة لا يعرف المراجعُ أنه
 *  خطأ إلا إن عرف الحيّ.
 *
 *  فثلاثُ طبقاتٍ تحلّ محلّ الدعوة:
 *
 *  ١ · **الاسم يقول الشرط**: «أنا في المحطة الآن» لا «موقعك الحالي». ومن
 *      ليس فيها يختار من الخريطة.
 *
 *  ٢ · **الاختيارُ بدل التخمين**: ما إن يُوضع الدبّوس تُعرض المحطاتُ
 *      المعروفة حوله من الخرائط المفتوحة — «هل محطتك إحدى هذه؟» — فضغطةٌ
 *      واحدة تضبط الموضع بدقّة المسح لا بدقّة الإبهام.
 *
 *  ٣ · **سؤالٌ عند الشكّ**: قِيست الأربعُ والعشرون المعتمدة، فوسيطُ بُعدها
 *      عن أقرب محطةٍ معروفة 76 متراً وعشرون منها ضمن كيلومتر. فما جاوز
 *      الكيلومتر يُسأل عنه — ولا يُمنع: أربعٌ صحيحةٌ جاوزته، ومنها محطتا
 *      القائم حيث لا تعرف الخرائطُ المفتوحة شيئاً.
 *
 *  ودقّةُ الجهاز تُقرأ أيضاً: نقطةٌ بدقّة نصف كيلومتر ليست موضعَ محطة. */
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
  const [accuracy, setAccuracy] = useState<number | null>(null);
  /** يُسكَت التحذير بعد أن يختار صاحبُ المحطة محطةً معروفة أو يؤكّد موضعه */
  const [picked, setPicked] = useState(false);

  const cityCentre = ANBAR_CITIES.find((c) => c.name === city);
  const near = coords ? knownFuelNear(coords.lat, coords.lng) : [];
  const far = coords ? metresToKnownFuel(coords.lat, coords.lng) > SUSPICIOUS_M : false;

  function useCurrentLocation() {
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(Math.round(pos.coords.accuracy));
        setPicked(false);
        setLocating(false);
        setShowMap(true); // let them confirm or nudge the pin
      },
      () => {
        setLocating(false);
        setShowMap(true);
        setNote('تعذّر تحديد موقعك. اختر موقع المحطة من الخريطة يدوياً.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-900">
        حدّد موقع <b>المحطة نفسها</b> — لا موقعك أنت. فالناس يقصدونها بهذا الدبّوس.
      </p>

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
          أنا في المحطة الآن
        </button>
      </div>

      {showMap && (
        <div className="mt-2">
          <MapPicker
            coords={coords}
            onPick={(c) => {
              onChange(c);
              setAccuracy(null);
              setPicked(false);
            }}
            center={cityCentre}
          />
        </div>
      )}

      {coords && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-brand">
          <CheckIcon className="h-4 w-4" />
          تم تحديد الموقع
          <span dir="ltr" className="text-slate-400">
            ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})
          </span>
          {accuracy != null && (
            <span className={accuracy > 100 ? 'font-bold text-traffic-red' : 'text-slate-400'}>
              · دقّة ±{accuracy} م
            </span>
          )}
        </p>
      )}

      {/* دقّةٌ رديئة تعني نقطةً في حيٍّ لا في محطة */}
      {accuracy != null && accuracy > 100 && (
        <p className="mt-1.5 rounded-lg border border-traffic-red bg-red-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-red-900">
          دقّةُ جهازك ±{accuracy} متراً — وهي أوسع من محطةٍ كاملة. اضبط الدبّوس على
          الخريطة يدوياً.
        </p>
      )}

      {/* **الاختيارُ بدل التخمين.** ضغطةٌ واحدة تضبط الموضع بدقّة المسح. */}
      {coords && near.length > 0 && (
        <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5">
          <p className="px-1 pb-1.5 text-[11px] font-bold text-brand-700">
            هل محطتك إحدى هذه؟ اضغطها ليُضبط الموقع بدقّة.
          </p>
          <div className="space-y-1.5">
            {near.map((n) => (
              <button
                key={`${n.station.la},${n.station.lo}`}
                type="button"
                onClick={() => {
                  onChange({ lat: n.station.la, lng: n.station.lo });
                  setAccuracy(null);
                  setPicked(true);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2 text-right active:bg-brand-50"
              >
                <span className="min-w-0 text-[12px] font-bold text-slate-800">
                  {n.station.n}
                </span>
                <span className="shrink-0 text-[10.5px] font-bold tabular-nums text-slate-500">
                  {n.metres < 950
                    ? `${Math.round(n.metres)} م`
                    : `${(n.metres / 1000).toFixed(1)} كم`}
                </span>
              </button>
            ))}
          </div>
          {picked && (
            <p className="mt-1.5 px-1 text-[10.5px] font-bold text-brand">
              ✓ ضُبط الموقع على المحطة المختارة.
            </p>
          )}
        </div>
      )}

      {/* **سؤالٌ لا منع.** أربعٌ من المعتمدات الأربعٍ وعشرين جاوزت الكيلومتر
          وهي صحيحة — فلا يُطرد صادقٌ، ويُنبَّه غافل. */}
      {coords && far && !picked && (
        <p className="mt-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-900">
          لم نجد محطةَ وقودٍ معروفة قرب هذه النقطة. تأكّد أنك حدّدت <b>موقع المحطة</b> لا
          موقع بيتك — فإن كانت محطتك جديدة أو في منطقةٍ لا تعرفها الخرائط فتابع، وسنراجعها.
        </p>
      )}

      {note && <p className="mt-2 text-xs text-traffic-red">{note}</p>}
    </div>
  );
}
