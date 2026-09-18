'use client';

import { useState } from 'react';
import { VEHICLE_LABELS, hasVehiclePhoto, vehiclePhoto, type VehicleType } from '@/lib/wash';

/** صورةُ الحجم: صورةٌ فوتوغرافيّةٌ للأحجام الثلاثة، وظلٌّ مرسومٌ لـ«أخرى» وحدَه.
 *
 *  ── لماذا بقي ظلٌّ واحدٌ فقط ──────────────────────────────────────────────
 *  صغيرة/وسط/كبيرة صارت صوراً حقيقيّةً في public/vehicles، والصورةُ تحسم الحجمَ
 *  أصدقَ من أيّ رسم. أمّا «أخرى» فليست حجماً رابعاً بل مخرجٌ لمن لا تندرج سيّارتُه
 *  (حمل، باص) — فلا صورةَ لها عمداً، وظلُّها الظِّليُّ يقول ذلك بالهيئة وحدَها:
 *  صندوقُ حملٍ عالٍ ومقصورةٌ قصيرة، هيئةٌ لا تشبه أيّاً من الصور الثلاث.
 *
 *  الظلُّ `currentColor`: الواجهةُ تلوّنه — رماديّاً حين لا يُختار وأخضرَ حين
 *  يُختار — فيصير اللونُ معنىً (الاختيار) لا زينة.
 *
 *  هندسةٌ محفوظة: القماشُ 200×88، مركزُ العجلة y=68، والإطارُ حلقةٌ مرسومةٌ
 *  (stroke) فيظهر الرملُ خلفها أيّاً كانت الخلفيّة. */

const WHEEL = { r: 11, w: 5.5 };

/** إطارٌ: حلقةٌ لا قرص — الثقبُ يقرأ جنطاً على أيّ خلفيّة. */
function Wheels({ front, rear }: { front: number; rear: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={WHEEL.w}>
      <circle cx={rear} cy={68} r={WHEEL.r} />
      <circle cx={front} cy={68} r={WHEEL.r} />
    </g>
  );
}

type ArtProps = { className?: string };
const box = (className?: string) => ({
  viewBox: '0 0 200 88',
  className,
  fill: 'currentColor',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true as const,
});

/** «أخرى»: صندوقُ حملٍ عالٍ ومقصورةٌ قصيرةٌ أمامَه — أوضحُ ما لا يكون سيّارةَ ركّاب.
 *
 *  الانعكاسُ (translate+scale) لا زينة: الصورُ الثلاثُ الشاحنةُ في public/vehicles أنوفُها
 *  إلى اليسار، والرسمُ مبنيٌّ إلى اليمين — وفي قائمةٍ رأسيّةٍ واحدةٍ تُقرأ البطاقةُ الرابعةُ
 *  مقلوبةً عن أخواتها. نعكسُ الرسمَ لأنّه الأرخص: الصورُ هي ما شُحن. */
export const OtherVehicleArt = ({ className }: ArtProps) => (
  <svg {...box(className)}>
    <g transform="translate(200,0) scale(-1,1)">
      <path
        fillRule="evenodd"
        d="M12 62V22c0-5 4-9 9-9h97v17h25c5 0 9 2 12 6l13 16 16 4c4 1 6 4 6 8v4h-14a14 14 0 0 0-28 0H62a14 14 0 0 0-28 0H12Zm114-24v14h18l-11-14h-7Z"
      />
      <Wheels rear={48} front={162} />
    </g>
  </svg>
);

/** الخريطةُ التي تقرؤها الواجهة — ناقصةٌ عمداً: الأحجامُ الثلاثةُ صورٌ لا رسوم. */
export const VEHICLE_ART: Partial<Record<VehicleType, (p: ArtProps) => React.ReactElement>> = {
  other: OtherVehicleArt,
};

/** صورةُ الحجم أينما عُرض — البوّابةُ الوحيدة: صورةٌ إن وُجدت، وإلّا الظلّ.
 *
 *  الصندوقُ ثابتُ المقاس كي لا ينهار الصفُّ إن غاب الملفّ. وإخفاقُ التحميل يسقط
 *  إلى الظلِّ مرّةً واحدة: العلامةُ هي مسارُ الصورة لا مجرّدُ صواب/خطأ، فلو بدّل
 *  النداءُ `v` في المكان نفسِه لم يجرّ إخفاقُ صورةٍ أختَها السليمةَ إلى الظلّ. */
export function VehicleImage({ v, className = 'h-[88px] w-[132px]' }: { v: VehicleType; className?: string }) {
  const [fell, setFell] = useState('');
  const src = vehiclePhoto(v);
  const Art = VEHICLE_ART[v] ?? OtherVehicleArt;
  if (!hasVehiclePhoto(v) || fell === src) return <Art className={`shrink-0 ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={VEHICLE_LABELS[v]}
      loading="lazy"
      onError={() => setFell(src)}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
