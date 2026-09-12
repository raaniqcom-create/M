'use client';

import { useState } from 'react';
import { ANBAR_CITIES } from '@/lib/cities';
import { PRODUCT_LABELS } from '@/lib/products';
import { plural } from '@/lib/freshness';
import { Sheet } from './Sheet';
import { ChevronDownIcon, MapPinIcon } from './icons';
import type { FuelProduct } from '@/types/database';

/** النطاق: مصدرُ حقيقةٍ واحد لما يُعرض على الشاشة كلها.
 *
 *  كان النطاق يُقرأ من ثلاثة مواضع تتقاطع — مدن الاشتراك المحفوظة، وزرّ
 *  «اعرض كل الأنبار»، وحقل المدينة داخل الفلاتر — وكل جزء من الصفحة يقرأ
 *  توليفةً مختلفة منها. وهذه هي الآلة التي أنتجت كل تناقضٍ في تاريخ هذه
 *  الصفحة: لوحةٌ تقول «١ بانزين محسن» وتحتها «لا توجد محطات»، وشارةٌ تقول
 *  «+٢» على الويب و«+١» على آيفون ولا شيء على أندرويد.
 *
 *  فصار مصدراً واحداً، مكتوباً باسمه فوق كل شيء، وكل رقمٍ تحته يتبعه.
 *
 *  والتعدّد لحظيّ لا محفوظ — وهو قرار المالك: 70% من المشتركين اختاروا
 *  مدينةً واحدة، وهي وحدها ما يُحفظ ويُبنى عليه الإشعار. ومن أراد أن يرى
 *  مدينةً ثانية اليوم — لأنه مسافر أو يسأل لأخيه — يضيفها لهذه الجلسة،
 *  ويعود التطبيق إلى مدينته حين يُفتح ثانية. وحفظُ ما اختير مرّةً بالخطأ
 *  يجعل المستخدم يتلقّى أخبار مدنٍ لا يقصدها ولا يعرف من أين جاءته. */
export function ScopeBar({
  homeCities,
  picked,
  allAnbar,
  onChange,
  cityCounts,
  cityNow,
  total,
  productCounts,
  activeProduct,
  onPickProduct,
}: {
  /** المدن المحفوظة في اشتراك الجهاز — null لمن لا اشتراك له */
  homeCities: string[] | null;
  /** الاختيار اللحظي — null يعني «استعمل المحفوظة» */
  picked: string[] | null;
  allAnbar: boolean;
  onChange: (picked: string[] | null, allAnbar: boolean) => void;
  /** محطاتُ كلّ مدينة — الوجود: من له محطةٌ واحدة له مدينةٌ في الورقة. */
  cityCounts: Map<string, number>;
  /** وما فيها وقودٌ الآن — الرقمُ الذي يُعرض، بمقياس الرأس نفسِه. */
  cityNow: Map<string, number>;
  total: number;
  productCounts: { product: FuelProduct; n: number }[];
  activeProduct: FuelProduct | null;
  onPickProduct: (p: FuelProduct) => void;
}) {
  const [open, setOpen] = useState(false);

  const home = homeCities?.[0] ?? null;
  const active = allAnbar ? null : (picked ?? homeCities);
  const label = allAnbar || !active?.length ? 'كل الأنبار' : active[0];
  const extra = allAnbar || !active ? 0 : active.length - 1;

  function toggle(city: string) {
    const base = active ?? [];
    const next = base.includes(city)
      ? base.filter((c) => c !== city)
      : [...base, city];
    // آخر مدينة لا تُنزَع: نطاقٌ فارغ يعني شاشةً فارغة بلا سببٍ ظاهر.
    onChange(next.length ? next : base, false);
  }

  return (
    <>
      {/* المدينةُ يميناً، والفراغُ بجانبها أزرارُ الوقود المتوفّر الآن —
          «هل نستطيع أن نضع به أزراراً صغيرة للوقود المتوفّر الآن بدل المنتجات
          المتوفّرة الآن؟» — صاحبُ المنصّة. فذهبت لوحةُ المنتجات وبقيت الأرقامُ
          نفسُها هنا، بمقياس النطاق نفسِه. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex max-w-full items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-2.5 py-2 text-sm text-white transition-colors hover:bg-white/25"
        >
          <MapPinIcon className="h-4 w-4 shrink-0" />
          <span className="truncate font-extrabold">{label}</span>
          {extra > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 py-px text-[10.5px] font-bold">
              +{extra}
            </span>
          )}
          <span className="text-white/45">·</span>
          <span className="whitespace-nowrap text-[11px] font-medium text-white/85">
            {total === 0 ? 'لا محطة' : plural(total, 'محطة', 'محطتان', 'محطات', 'محطة')}
          </span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
        </button>

        {/* «المنتجاتُ لم تظهر كاملة!» — كانت شريطاً يُقصّ عند حافّة الشاشة؛
            فصارت تلتفّ إلى سطرٍ ثانٍ حين يضيق المكان. */}
        {productCounts.map(({ product, n }) => {
          const on = activeProduct === product;
          return (
            <button
              key={product}
              type="button"
              aria-pressed={on}
              onClick={() => onPickProduct(product)}
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1.5 text-[11px] font-bold transition-colors ${
                on ? 'border-white bg-white text-brand-800' : 'border-white/25 bg-white/15 text-white'
              }`}
            >
              <span className="text-[12px] font-extrabold">{n}</span>
              {PRODUCT_LABELS[product]}
            </button>
          );
        })}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="اختر مدينة — أو أكثر"
        hint={
          home
            ? `مدينتك ${home} محفوظة. وما تضيفه هنا لهذه الجلسة وحدها — لا يُحفظ، وتعود إلى مدينتك حين تفتح التطبيق مرّةً أخرى.`
            : 'اختر مدينةً أو أكثر لهذه الجلسة. ولحفظها ووصول الإشعارات، فعّل التنبيهات من «حسابي».'
        }
      >
        {/* «أظهر المتوفّرَ الآن، والتي قريباً اجعلها عدداً» — صاحبُ المنصّة.
            فالمدنُ التي فيها محطاتٌ وحدَها في الشبكة، ورقمُها ما فيها وقودٌ الآن
            (مقياسُ الرأس نفسُه)، والخالياتُ سطرٌ واحدٌ يعدّها — لا تُحذف من
            الورقة كلّيّاً: من في النخيب يقرأ أنّ مدينتَه على الطريق. */}
        <div className="grid grid-cols-2 gap-2">
          {ANBAR_CITIES.filter((c) => (cityCounts.get(c.name) ?? 0) > 0).map((c) => {
            const n = cityNow.get(c.name) ?? 0;
            const on = !allAnbar && !!active?.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => toggle(c.name)}
                aria-pressed={on}
                className={`relative flex items-center justify-between gap-1.5 rounded-xl border p-2.5 transition-colors ${
                  on ? 'border-brand bg-brand text-white' : 'border-slate-200 hover:bg-brand-50'
                }`}
              >
                {c.name === home && (
                  <span className="absolute -top-1.5 start-2 rounded-full bg-traffic-yellow px-1.5 text-[8.5px] font-extrabold text-white">
                    الأساسية
                  </span>
                )}
                <span className={`text-xs font-bold ${on ? 'text-white' : 'text-slate-700'}`}>
                  {c.name}
                </span>
                <span
                  className={`text-[11px] font-extrabold ${
                    on ? 'text-white/90' : n ? 'text-brand-700' : 'text-slate-300'
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onChange(null, !allAnbar)}
            aria-pressed={allAnbar}
            className={`col-span-2 rounded-xl border border-dashed p-2.5 text-xs font-bold transition-colors ${
              allAnbar ? 'border-brand bg-brand text-white' : 'border-slate-300 text-slate-700 hover:bg-brand-50'
            }`}
          >
            كل الأنبار · {[...cityNow.values()].reduce((a, b) => a + b, 0)} فيها وقودٌ الآن
          </button>
        </div>
        {ANBAR_CITIES.some((c) => !(cityCounts.get(c.name) ?? 0)) && (
          <p className="mt-2 text-center text-[11px] text-slate-400">
            و{plural(
              ANBAR_CITIES.filter((c) => !(cityCounts.get(c.name) ?? 0)).length,
              'مدينة واحدة',
              'مدينتان',
              'مدن',
              'مدينة'
            )}{' '}
            قريباً إن شاء الله
          </p>
        )}

        {/* أنواع المنتجات هنا أيضاً: من فتح هذه الورقة يبحث عن شيء، وأقصر
            طريقٍ إليه أن يضغط نوعه مباشرةً بدل أن يُغلق ويبحث عن اللوحة. */}
        {productCounts.length > 0 && (
          <>
            <p className="mt-4 text-[10.5px] font-extrabold tracking-wide text-slate-400">
              أو ابحث بنوع المنتج
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {productCounts.map(({ product, n }) => (
                <button
                  key={product}
                  type="button"
                  onClick={() => {
                    onPickProduct(product);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                    activeProduct === product
                      ? 'border-brand bg-brand text-white'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {PRODUCT_LABELS[product]}
                  <span className="text-[10px] opacity-75">{n}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {!allAnbar && (active?.length ?? 0) > 1 && (
          <p className="mt-3 rounded-xl border border-traffic-yellow bg-amber-50 p-2.5 text-[10px] leading-relaxed text-slate-700">
            اخترتَ <b>{active!.length}</b> مدن لهذه الجلسة. <b>لن تُحفظ</b> — وحين تعود يظهر{' '}
            <b>{home ?? 'اختيارك الأصلي'}</b>، وإشعاراتك تبقى على مدينتك الأساسية.
          </p>
        )}

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn-primary">
            اعرض المحطات
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(null, false);
              setOpen(false);
            }}
            className="btn-ghost px-4"
          >
            {home ? 'مدينتي فقط' : 'مسح'}
          </button>
        </div>
      </Sheet>
    </>
  );
}
