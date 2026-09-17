'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_LABELS } from '@/lib/products';
import { ageLabel, hasRunOut } from '@/lib/hours';
import type { FuelProduct, StationProduct } from '@/types/database';

/** سؤالُ الساعتين على الشاشة، حيث اليدُ على الزرّ.
 *
 *  «يأتي إشعارٌ بعد كلّ ساعتين، مع تنبيهٍ منبثقٍ بالأحمر على الشاشة، والزرّ
 *  الموجود يكون: أغلق المنتج — مثلاً بنزين العادي» — صاحبُ المنصّة، ١٨ أيلول.
 *
 *  والإشعارُ يرنّ ولا يُفتح، فتبقى المحطةُ تعرض بانزيناً نفد منذ الظهر.
 *  فالسؤالُ يُطرح في اللوحة نفسِها ومعه جوابُه: زرٌّ أحمرُ يُغلق **هذا المنتج**
 *  بضغطة، لا رحلةٌ إلى الجدول ثمّ بحثٌ عن الصفّ.
 *
 *  ── وتحسب من الصفوف لا من الرابط ────────────────────────────────────────
 *
 *  `?off=` تلميحٌ لا مصدر: الإشعارُ لا يصل صاحبَ تيليجرام ولا من فتح التطبيقَ
 *  من تلقائه، ورابطٌ قديمٌ يفتح سؤالاً عن منتجٍ أُغلق قبل ساعة. واللوحةُ تحمل
 *  `products` أصلاً، فلا استعلامَ ولا عمودَ جديد.
 *
 *  ── وواحدةٌ لا سبع ──────────────────────────────────────────────────────
 *
 *  الأقدمُ أوّلاً، ومتى أُجيب جاء الذي يليه. والإغلاقُ يُتذكَّر **لخانةِ ساعتين
 *  واحدة**: لا تعود مع كلّ رسم، وتعود مع الخانة التالية — فمن أجّل لا يُسأل
 *  مرّتين في الساعة، ولا يُنسى. */
const ASK_MS = 2 * 3600_000;
const SEEN = 'off-seen';

/** ختمُ الصفّ وخانتُه: يتغيّر بتقدّم الساعتين، وبأيّ تأكيدٍ من صاحبه. */
const bucketOf = (updatedAt: string) =>
  `${updatedAt}:${Math.floor((Date.now() - new Date(updatedAt).getTime()) / ASK_MS)}`;

export function StaleProductPopup({
  products,
  prefer,
  busy,
  onOff,
  onKeep,
}: {
  products: StationProduct[];
  /** المنتجُ الذي جاء الإشعارُ من أجله — يُقدَّم إن كان ما زال مستحقّاً. */
  prefer?: FuelProduct | null;
  busy?: boolean;
  onOff: (p: FuelProduct) => Promise<unknown> | void;
  onKeep: (p: FuelProduct) => Promise<unknown> | void;
}) {
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  // واللوحةُ تبقى مفتوحةً ساعاتٍ على منضدةٍ في الساحة. وبلا نبضةٍ لا يُعاد
  // الحسابُ أبداً: يمرّ عمرُ الخبر ولا تظهر الشاشةُ حتى يُلمس شيءٌ آخر.
  const [, tick] = useState(0);

  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN) ?? '{}'));
    } catch {
      /* تصفّحٌ خاصّ — تُنسى بين الجلسات وتعمل في هذه */
    }
    setReady(true);
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const due = products
    .filter(
      (p) =>
        p.is_available &&
        !hasRunOut(p.runs_out_at) &&
        Date.now() - new Date(p.updated_at).getTime() >= ASK_MS
    )
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));

  const fresh = (p: StationProduct) => seen[p.product] !== bucketOf(p.updated_at);
  const one = due.find((p) => p.product === prefer && fresh(p)) ?? due.find(fresh);

  function close() {
    if (!one) return;
    const next = { ...seen, [one.product]: bucketOf(one.updated_at) };
    setSeen(next);
    try {
      localStorage.setItem(SEEN, JSON.stringify(next));
    } catch {
      /* الجلسةُ وحدَها */
    }
  }

  useEffect(() => {
    if (!one) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ولا تُرسم قبل قراءة التخزين: وميضُ شاشةٍ تختفي أسوأُ من ألّا تظهر.
  if (!ready || !one) return null;

  const label = PRODUCT_LABELS[one.product];

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-title"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-traffic-red bg-white p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="stale-title" className="text-base font-extrabold leading-relaxed text-traffic-red">
          هل ما زال {label} متوفراً؟
        </p>

        <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-[12px] font-bold leading-relaxed text-red-900">
          أعلنتَه {ageLabel(one.updated_at)} وما زال معروضاً للناس. إن نفد فأغلقه الآن — فلا
          يقطع أحدٌ الطريق إليك عبثاً.
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            await onOff(one.product);
            close();
          }}
          className="mt-4 min-h-[48px] w-full rounded-xl bg-traffic-red text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          ⛔ أغلق {label}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            await onKeep(one.product);
            close();
          }}
          className="btn-ghost mt-2 w-full"
        >
          ما زال متوفراً
        </button>
        <button
          type="button"
          onClick={close}
          className="mt-2 w-full text-[11.5px] font-bold text-slate-400"
        >
          لاحقاً
        </button>
      </div>
    </div>
  );
}
