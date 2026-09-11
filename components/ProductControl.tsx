'use client';

import { useState } from 'react';
import { PRODUCT_LABELS, expectedText, isoDateIn } from '@/lib/products';
import { PERIODS, PERIOD_LABELS, hasRunOut, runsOutLabel, type ExpectedPeriod } from '@/lib/hours';
import { SpinnerIcon } from './icons';
import type { FuelProduct, StationProduct } from '@/types/database';

/** الحالاتُ الثلاث كما يقولها صاحبُ المحطة لزبونه. */
export type ProductState = 'in' | 'soon' | 'out';

const WHEN = [
  { label: 'اليوم', days: 0 },
  { label: 'غداً', days: 1 },
  { label: 'بعد غد', days: 2 },
];

/** ساعاتٌ من الآن، لا ساعةُ حائط.
 *
 *  صاحبُ المحطة يعرف كم بقي عنده لا متى ينتهي بالضبط، وأربعةُ أزرارٍ أسرعُ
 *  من حقل وقتٍ يُملأ بإصبعٍ على هاتفٍ في ساحةٍ مزدحمة. والحصصُ تُوزَّع في
 *  الغالب على ساعتين إلى ستّ — وهو مدى هذه الأزرار. */
const RUNS_OUT = [
  { label: 'ساعة', hours: 1 },
  { label: 'ساعتان', hours: 2 },
  { label: '3 ساعات', hours: 3 },
  { label: '6 ساعات', hours: 6 },
];

/** ثلاثةُ أزرارٍ مسمّاةٍ لا اثنان، ولا مفتاحُ تبديل.
 *
 *  ── ولماذا صارت ثلاثة ────────────────────────────────────────────────────
 *
 *  اتّصل صاحبُ محطةٍ فقال: «نحن نجبر على وضع كلمة متوقع غدا وهذه عدم مصداقية
 *  مع الزبون». وكان محقّاً: الزرّان يقولان «متوفر» و«غير متوفر»، والثاني
 *  يُسقط المحطةَ من القائمة إن لم يكن تحته وعد — فمن لا وقودَ عنده ولا يعرف
 *  متى يصل، ثمنُ ظهوره أن يخترع «غداً». وقِيس يومَ كُتب هذا: **أربعَ عشرةَ
 *  محطةً من إحدى وأربعين تبقى ظاهرةً بالوعد وحدَه**.
 *
 *  فصارت «متوقّع» حالةً ثالثةً مسمّاةً بزرّها، و«غير متوفر» تعني ما تقوله:
 *  لا وقودَ ولا وعد. والزرُّ الثالثُ **يفتح السؤال ولا يكتب تاريخاً** — وإلّا
 *  كان هو الإجبارَ نفسَه بزرٍّ أنيقٍ بدل نصّ.
 *
 *  ولا مفتاحُ تبديل: مفتاحٌ يجعل المالكَ يستنتج أيُّ جانبٍ يعني «متوفر»،
 *  وخطؤه يُرسل سائقين إلى محطةٍ جافّة. */
export function ProductControl({
  product,
  row,
  saving,
  open,
  onFocus,
  onSetState,
  onSetExpected,
  onSetRunsOut,
}: {
  product: FuelProduct;
  row: StationProduct | undefined;
  saving: boolean;
  /** أهذا المنتجُ هو المفتوح؟ — واحدٌ فقط تُفتح تفاصيلُه (موعدُ النفاد أو
   *  الوصول)، فلا تطول القائمةُ بسبعة صناديقَ مفتوحة. والصفحةُ تملك الجواب. */
  open: boolean;
  onFocus: () => void;
  onSetState: (next: ProductState) => void;
  onSetExpected: (
    date: string | null,
    period: ExpectedPeriod | null,
    time: string | null
  ) => void;
  onSetRunsOut: (hours: number | null) => void;
}) {
  const available = row?.is_available ?? false;
  const expectedAt = row?.expected_at ?? null;
  const expectedPeriod = (row?.expected_period ?? null) as ExpectedPeriod | null;
  const expectedTime = row?.expected_time ?? null;
  const runsOutAt = row?.runs_out_at ?? null;

  // ونفادٌ مضى موعدُه «غير متوفر» وإن بقي الصفُّ مضاءً دقائقَ قبل أن يطفئه
  // كرونُ `expire_run_outs` — فلا يقرأ صاحبُ المحطة «متوفر» عمّا قال إنّه نفد.
  const state: ProductState =
    available && !hasRunOut(runsOutAt) ? 'in' : expectedAt ? 'soon' : 'out';

  // «متوقّع» تُضغط فيُفتح السؤال، والحالةُ لا تتغيّر حتى يُختار يوم. فمن ضغطها
  // ثمّ عدل بقي على ما كان، ولم تُكتب في لوحته كلمةٌ لم يقلها.
  const [asking, setAsking] = useState(false);
  const showRunsOut = open && state === 'in';
  const showExpected = open && (state === 'soon' || asking);

  // كلُّ ضغطةٍ تفتح هذا المنتجَ وتُغلق غيرَه. وضغطةٌ على الحالة القائمة لا
  // تكتب شيئاً — تفتح تفاصيلَه فقط، فلا يُختم الوقتُ عن لمسةٍ لم تغيّر حرفاً.
  const pick = (next: ProductState) => {
    onFocus();
    setAsking(next === 'soon');
    if (next !== 'soon' && next !== state) onSetState(next);
  };

  const chip = (on: boolean, tone: string, open = false) =>
    `flex min-h-[38px] items-center justify-center gap-1 rounded-lg border px-1 text-[12px] font-bold transition-colors duration-200 disabled:opacity-50 ${
      on ? tone : open ? 'border-amber-500 bg-white text-amber-700' : 'border-slate-200 bg-white text-slate-500'
    }`;

  return (
    <li className="py-2">
      {/* ── الاسمُ والأزرارُ الثلاثة في سطرٍ واحد ──────────────────────────
        *
        *  كان الاسمُ سطراً والأزرارُ سطراً، فسبعةُ منتجاتٍ تحتاج شاشةً ونصفاً
        *  ولا يرى صاحبُ المحطة إلّا أربعة. وطلبُه: «صغّر المساحة كي تكون أمام
        *  عين المستخدم مباشرة». فعلى ٣٦٠ بكسل: الاسمُ ٧٢ والأزرارُ الثلاثة في
        *  الباقي — نحوُ ٨٥ لكلٍّ، و«غير متوفر» بحرف ١٢ تسعُها. والترتيبُ يتبع
        *  الوثيقة: متوفر ← متوقّع ← غير متوفر، التوفّرُ نازلاً. */}
      <div className="flex items-center gap-2">
        <span className="flex w-[64px] shrink-0 items-center gap-1 text-[12px] font-bold leading-tight">
          {PRODUCT_LABELS[product]}
          {saving && <SpinnerIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        </span>
        <div className="grid flex-1 grid-cols-3 gap-1">
        <button
          type="button"
          aria-pressed={state === 'in'}
          disabled={saving}
          onClick={() => pick('in')}
          className={chip(state === 'in', 'border-brand bg-brand text-white')}
        >
          متوفر
        </button>
        <button
          type="button"
          aria-pressed={state === 'soon'}
          // والملءُ للحالة الواقعة، والطَّوقُ للسؤال المفتوح. ولولا الفرقُ
          // لظهر زرّان مضغوطان معاً لمن ضغط «متوقّع» وهو متوفّرٌ ولم يختر
          // يوماً بعد — وحالةُ المنتج لم تتغيّر بعدُ حرفاً.
          disabled={saving}
          onClick={() => pick('soon')}
          className={chip(
            state === 'soon',
            'border-amber-500 bg-amber-500 text-white',
            asking && state !== 'soon'
          )}
        >
          متوقّع
        </button>
        <button
          type="button"
          aria-pressed={state === 'out'}
          disabled={saving}
          onClick={() => pick('out')}
          className={chip(state === 'out', 'border-traffic-red bg-traffic-red text-white')}
        >
          غير متوفر
        </button>
        </div>
      </div>

      {showRunsOut && (
        <div className="mt-2.5 rounded-xl bg-brand-50 p-2.5">
          <p className="text-[11px] font-semibold text-brand-800">متى تتوقع نفاده؟ (اختياري)</p>

          {/* و«بلا موعد» زرٌّ قائمٌ لا غيابُ اختيار: «الأعدادُ غيرُ متوقَّعة، ولا
              يريد أن يُجبر نفسَه» — صاحبُ المنصّة. فمن لا يعرف يقولها صراحةً
              ويرى زرَّه مضيئاً، بدل أن يترك الثلاثةَ ويظنّ أنّه نسي. */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={!runsOutAt}
              disabled={saving}
              onClick={() => runsOutAt && onSetRunsOut(null)}
              className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors duration-200 disabled:opacity-50 ${
                runsOutAt ? 'bg-white text-brand-800' : 'bg-brand text-white'
              }`}
            >
              بلا موعد
            </button>
            {RUNS_OUT.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                disabled={saving}
                onClick={() => onSetRunsOut(opt.hours)}
                className="min-h-[34px] rounded-lg bg-white px-3 text-[12px] font-semibold text-brand-800 disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed font-bold text-brand-900">
            {runsOutAt
              ? `يظهر للمستخدمين: حتى ${runsOutLabel(runsOutAt)} — وبعدها يختفي من القائمة حتى تؤكّده.`
              : 'بلا موعد يبقى معروضاً حتى تُطفئه بنفسك.'}
          </p>
        </div>
      )}

      {showExpected && (
        <div className="mt-2.5 rounded-xl bg-amber-50 p-2.5">
          <p className="text-[11px] font-semibold text-amber-800">متى تتوقع وصوله؟</p>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {WHEN.map((opt) => {
              const active = expectedAt === isoDateIn(opt.days);
              return (
                <button
                  key={opt.days}
                  type="button"
                  aria-pressed={active}
                  disabled={saving}
                  onClick={() =>
                    onSetExpected(
                      active ? null : isoDateIn(opt.days),
                      active ? null : expectedPeriod,
                      active ? null : expectedTime
                    )
                  }
                  className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors duration-200 disabled:opacity-50 ${
                    active ? 'bg-amber-500 text-white' : 'bg-white text-amber-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {expectedAt && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {PERIODS.map((p) => {
                  const active = expectedPeriod === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={active}
                      disabled={saving}
                      // واختيارُ فترةٍ يمحو الساعة: «الصباح ٦:٠٠» حشوٌ يُقرأ
                      // مرّتين، ولا تُخزَّن حالةٌ لا تُعرض.
                      onClick={() => onSetExpected(expectedAt, active ? null : p, null)}
                      className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors duration-200 disabled:opacity-50 ${
                        active ? 'bg-amber-600 text-white' : 'bg-white text-amber-800'
                      }`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  );
                })}
              </div>

              {/* والساعةُ الدقيقةُ لمن يعرفها — وهي التي طلبتها المحطة.
                  حقلٌ أصليّ: iOS يفتح العجلةَ وأندرويد الساعة، والقيمةُ
                  "HH:MM" وهي ما يقبله عمود `time` وما تقرؤه `formatTime`.
                  و`dir="ltr"` كي تُقرأ ٦:٠٠ لا ٠٠:٦. */}
              <label className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-amber-800">
                أو ساعةٌ بعينها
                <input
                  type="time"
                  step={900}
                  dir="ltr"
                  disabled={saving}
                  value={expectedTime ? expectedTime.slice(0, 5) : ''}
                  onChange={(e) => onSetExpected(expectedAt, null, e.target.value || null)}
                  className="min-h-[34px] rounded-lg bg-white px-2 text-[12px] font-semibold text-amber-900 disabled:opacity-50"
                />
                {expectedTime && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onSetExpected(expectedAt, expectedPeriod, null)}
                    className="min-h-[34px] px-1 text-[12px] font-semibold text-traffic-red disabled:opacity-50"
                  >
                    امسح الساعة
                  </button>
                )}
              </label>

              {/* والمعاينةُ تطابق المعروضَ حرفاً — من `expectedText` نفسِها
                  التي تبني شريحةَ البطاقة. وإلّا كذبت على من يقرؤها. */}
              <p className="mt-2 text-[11px] font-bold text-amber-900">
                يظهر للمستخدمين:{' '}
                {expectedText({
                  expected_at: expectedAt,
                  expected_period: expectedPeriod,
                  expected_time: expectedTime,
                })}
              </p>
            </>
          )}

          {!expectedAt && (
            <p className="mt-2 text-[11px] font-bold text-amber-900">
              اختر اليوم أوّلاً — ولك أن تترك الساعة.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
