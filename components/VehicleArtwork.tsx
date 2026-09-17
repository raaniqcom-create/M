import type { VehicleType } from '@/lib/wash';

/** ظلالٌ ظِليّةٌ أحاديّةُ اللون لأنواع السيارات — لا رسومٌ كرتونيّة.
 *
 *  ── لماذا ظلٌّ لا رسمٌ ملوّن ───────────────────────────────────────────────
 *  المطلوبُ من الصورة شيءٌ واحد: أن يعرف الزبونُ أيَّ نوعٍ سيّارتُه حين تختلف
 *  التسمياتُ (صالون/سيدان، بيك أب/حمل). والظلُّ الظِّليُّ يقول ذلك بالهيئة
 *  وحدَها — طولُ الغطاء، ارتفاعُ السقف، حوضٌ مفتوح، صندوقٌ واحد. أمّا الألوانُ
 *  والحدودُ السميكةُ والعجلاتُ ذاتُ المحاور فزخرفةٌ تُدخل خمسةَ ألوانٍ غريبةٍ
 *  على واجهةٍ خضراء، وتجعل المُنتقي يُقرأ لعبةً لا خدمةً.
 *
 *  كلُّها `currentColor`: الواجهةُ تلوّنها — رماديّةً هادئةً حين لا تُختار،
 *  وخضراءَ حين تُختار — فيصير اللونُ معنىً (الاختيار) لا زينة.
 *
 *  هندسةٌ مشتركةٌ تُبقيها عائلةً واحدة: القماشُ 200×88، مركزُ العجلة y=68،
 *  والإطارُ حلقةٌ مرسومةٌ (stroke) فيظهر الرملُ خلفها أيّاً كانت الخلفيّة. */

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

/** صالون: ثلاثةُ صناديق — غطاءٌ طويلٌ وسقفٌ منخفضٌ وصندوقٌ خلفيّ. */
export const SedanArt = ({ className }: ArtProps) => (
  <svg {...box(className)}>
    <path
      fillRule="evenodd"
      d="M12 64c0-9 4-14 13-16l40-9 18-13c4-3 9-5 15-5h30c8 0 15 3 20 8l14 14 22 5c8 2 12 7 12 14v6h-26a14 14 0 0 0-28 0H66a14 14 0 0 0-28 0H12v-4Zm74-27-13 11h24V36h-6c-2 0-4 0-5 1Zm23 11h39l-11-11c-3-3-7-4-11-4h-17v15Z"
    />
    <Wheels rear={52} front={150} />
  </svg>
);

/** دفعٌ رباعيّ: صندوقان — سقفٌ عالٍ قصيرٌ ثمّ درجةُ غطاءٍ واضحة. أقصرُ من الفان عمداً. */
export const SuvArt = ({ className }: ArtProps) => (
  <svg {...box(className)}>
    <path
      fillRule="evenodd"
      d="M26 62V26c0-4 4-8 8-8h84c5 0 9 2 12 6l16 20 18 4c6 2 9 6 9 11v3h-13a14 14 0 0 0-28 0H74a14 14 0 0 0-28 0H26Zm8-36v16h34V26H34Zm42 0v16h34V26H76Zm42 0v16h22l-12-14c-2-2-4-2-6-2h-4Z"
    />
    <Wheels rear={60} front={146} />
  </svg>
);

/** بيك أب: مقصورةٌ أماماً وحوضٌ مفتوحٌ خلفَها — الفجوةُ هي العلامة. */
export const PickupArt = ({ className }: ArtProps) => (
  <svg {...box(className)}>
    <path
      fillRule="evenodd"
      d="M10 62c0-6 3-10 9-11V43h76V26c0-5 4-9 9-9h40c5 0 9 2 12 6l18 20 12 3c8 2 12 7 12 13v5h-24a14 14 0 0 0-28 0H64a14 14 0 0 0-28 0H10v-2Zm101-36v17h26V26h-26Zm38 0v17h25l-12-13c-2-3-5-4-8-4h-5Z"
    />
    <Wheels rear={50} front={152} />
  </svg>
);

/** فان: صندوقٌ واحد — الأطولُ والأعلى، وغطاءٌ يكاد لا يُرى. */
export const VanArt = ({ className }: ArtProps) => (
  <svg {...box(className)}>
    <path
      fillRule="evenodd"
      d="M14 62V20c0-4 4-7 8-7h128c5 0 9 2 12 6l18 25 6 2c4 2 6 6 6 11v5h-14a14 14 0 0 0-28 0H62a14 14 0 0 0-28 0H14Zm8-41v21h34V21H22Zm42 0v21h34V21H64Zm42 0v21h34V21h-34Zm42 0v21h24l-14-19c-2-2-4-2-6-2h-4Z"
    />
    <Wheels rear={48} front={164} />
  </svg>
);

/** صغيرة: هاتشباك قصيرةٌ بخلفيّةٍ مائلةٍ حادّة — أقصرُ من الجميع عمداً. */
export const HatchArt = ({ className }: ArtProps) => (
  <svg {...box(className)}>
    <path
      fillRule="evenodd"
      d="M34 62c0-8 4-13 12-15l10-3 20-17c4-3 8-5 13-5h27c7 0 13 3 17 8l14 17 13 4c7 2 11 7 11 13v4h-22a14 14 0 0 0-28 0H84a14 14 0 0 0-28 0H34v-6Zm48-25-14 12h26V36h-7c-2 0-4 0-5 1Zm24 12h30l-10-12c-3-3-6-5-10-5h-10v17Z"
    />
    <Wheels rear={70} front={144} />
  </svg>
);

/** الخريطةُ التي تقرؤها الواجهة. */
export const VEHICLE_ART: Record<VehicleType, (p: ArtProps) => React.ReactElement> = {
  sedan: SedanArt,
  suv: SuvArt,
  pickup: PickupArt,
  van: VanArt,
  other: HatchArt,
};
