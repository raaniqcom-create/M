'use client';

import { PRODUCT_LABELS, PRODUCT_ORDER, isOffered } from '@/lib/products';
import { isOpenNow } from '@/lib/hours';
import type { FuelProduct, StationWithStatus } from '@/types/database';
import type { OpenAnnouncement } from '@/lib/announcements';

export function ProductsDashboard({
  stations,
  filter,
  onPick,
  announced = [],
  onPickAnnounced,
}: {
  stations: StationWithStatus[];
  filter: FuelProduct | null;
  onPick: (p: FuelProduct | null) => void;
  /** أخبار اليوم عن محطات لم تنضمّ — تُعدّ منفصلةً ولا تُخلط. */
  announced?: OpenAnnouncement[];
  onPickAnnounced?: () => void;
}) {
  // "available now" must mean collectable now — a closed station holding fuel
  // is not a place to send a driver
  const counts = new Map<FuelProduct, number>();
  // ومحطات الإشعار في عدّاد ثانٍ: نفس المنتج، ومصدرٌ آخر بثقة أخرى.
  const announcedCounts = new Map<FuelProduct, number>();
  for (const a of announced) {
    if (a.product) announcedCounts.set(a.product, (announcedCounts.get(a.product) ?? 0) + 1);
  }
  // isOffered لا is_available وحدها.
  //
  // كان العدّ يتجاهل عمر الإعلان، فيقول «بانزين محسن: ١» عن خبرٍ عمره ٢٨ ساعة
  // بينما القائمة تفحص الحداثة فلا تجد شيئاً. فيضغط المستخدم الرقم ويُقال له
  // «لا توجد محطة يتوفر فيها بانزين محسن» — رقمٌ يناقض نفسه بضغطة واحدة.
  for (const s of stations) {
    for (const p of s.products) {
      if (isOffered(s, p)) counts.set(p.product, (counts.get(p.product) ?? 0) + 1);
    }
  }

  return (
    <section className="card p-4" aria-label="المنتجات المتوفرة الآن">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-900">المنتجات المتوفرة الآن</h2>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          مباشر
        </span>
      </div>

      {/* الأخبار لا تُخلط بالمحطات المسجّلة.
        *
        *  محطةٌ مسجّلة تقول ما لديها وتصحّحه لحظة، ومحطةٌ أُعلن عنها بإشعار لا
        *  نعرف عنها إلا لحظةً مضت. فجمعُ الرقمين في رقم واحد يُلبس الخبرَ ثقةَ
        *  المسجّل — وهو ما جعل «بانزين محسن ١» يقود إلى «لا توجد محطة».
        *
        *  فيُعدّان معاً ويُعرضان متمايزين: الرقم الأخضر مسجّل، والأحمر الخفيف
        *  معلَنٌ بإشعار، وضغطُه يقود إلى اللوحة الحمراء لا إلى قائمة فارغة. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {PRODUCT_ORDER.filter(
          (p) => (counts.get(p) ?? 0) > 0 || (announcedCounts.get(p) ?? 0) > 0 || filter === p
        ).map((product) => {
          const count = counts.get(product) ?? 0;
          const extra = announcedCounts.get(product) ?? 0;
          const active = filter === product;
          // خبرٌ بلا محطة مسجّلة: البطاقة كلها حمراء خفيفة، وضغطها يذهب إليه.
          const onlyAnnounced = count === 0 && extra > 0;
          return (
            <button
              key={product}
              type="button"
              aria-pressed={active}
              onClick={() => (onlyAnnounced ? onPickAnnounced?.() : onPick(active ? null : product))}
              className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border px-1 transition-colors duration-200 ${
                active
                  ? 'border-brand bg-brand text-white'
                  : onlyAnnounced
                    ? 'border-red-200 bg-red-50 text-traffic-red'
                    : 'border-brand-100 bg-brand-50 text-brand-900'
              }`}
            >
              <span className="text-lg font-extrabold leading-none">
                {onlyAnnounced ? extra : count}
              </span>
              <span className="mt-1 text-[11px] font-semibold leading-tight">
                {PRODUCT_LABELS[product]}
              </span>
              {extra > 0 && !onlyAnnounced && (
                <span className="mt-0.5 rounded-full bg-red-50 px-1.5 text-[10px] font-bold text-traffic-red">
                  +{extra} معلَن
                </span>
              )}
              {onlyAnnounced && (
                <span className="mt-0.5 text-[10px] font-bold">معلَن بإشعار</span>
              )}
            </button>
          );
        })}
      </div>
      {[...counts.values()].length === 0 && announcedCounts.size === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          لا يتوفر أي منتج في المحطات المفتوحة حالياً
        </p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          العدد يمثل المحطات المفتوحة الآن التي يتوفر فيها المنتج — اضغط للتصفية
        </p>
      )}
    </section>
  );
}
