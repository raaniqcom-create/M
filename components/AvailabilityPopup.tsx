'use client';

import { useEffect, useState } from 'react';
import { useAlertChoice } from '@/lib/alerts';
import { forCities, type OpenAnnouncement } from '@/lib/announcements';
import { PRODUCT_LABELS } from '@/lib/products';
import { agoLabel } from '@/lib/freshness';
import { FuelIcon, XIcon } from './icons';

const SEEN = 'ann-seen:';

/** خبرٌ اختارت الإدارة أن يُقاطَع من أجله.
 *
 *  اللوحة تحمل أخبار اليوم كلها؛ وهذه للاستثنائي منها — أوّل بانزين محسن في
 *  المدينة منذ أسبوع. والقرار عند الإنشاء بخانةٍ يؤشّرها المدير، لا تلقائياً:
 *  شاشةٌ تظهر مع كل خبر تُعلّم الناس إغلاقها قبل قراءتها، فلا تنفع في اليوم
 *  الذي تُحتاج فيه.
 *
 *  ولأنها تقطع على القارئ ما يفعله، فثلاثة قيود:
 *
 *  · تُغلق ولا تعود. مفتاحٌ لكل خبر في التخزين، فمن أغلقها لا يراها ثانيةً —
 *    وشاشةٌ تعود بعد إغلاقها تُعلّم الناس أن يغلقوا كل شيء بلا قراءة.
 *  · واحدة لا أكثر. خبران يتزاحمان على الشاشة يصيران إزعاجاً لا خبراً.
 *  · ولا تظهر إلا لمن يعنيه: مدنُ المشترك هي حدّها.
 *
 *  ولا تُعرض إلا ما دامت لوحة المحطة تؤكّد الخبر — الشرط في القاعدة، فصاحبها
 *  يرفع المنتج فتسقط الشاشة معه. */
export function AvailabilityPopup({ rows }: { rows: OpenAnnouncement[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const { choice } = useAlertChoice();

  useEffect(() => {
    try {
      const seen = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(SEEN)) seen.add(k.slice(SEEN.length));
      }
      setDismissed(seen);
    } catch {
      /* وضع خاص: تظهر مرة في كل جلسة، ولا تُتذكّر */
    }
    setReady(true);
  }, []);

  function close(id: string) {
    setDismissed((s) => new Set(s).add(id));
    try {
      localStorage.setItem(SEEN + id, '1');
    } catch {
      /* لا يُتذكّر، والإغلاق يعمل في هذه الجلسة */
    }
  }

  // ما اختارته الإدارة وحده. والباقي يجد مكانه في اللوحة بلا مقاطعة.
  const mine = forCities(rows, choice?.cities).filter((r) => r.as_popup);
  const one = mine.find((r) => !dismissed.has(r.id));

  // لا تُرسم قبل قراءة التخزين: وميضُ شاشة تختفي بعد جزء من الثانية أسوأ من
  // ألّا تظهر، لأن القارئ يراها ولا يلحقها.
  if (!ready || !one) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ann-title"
      onClick={() => close(one.id)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p id="ann-title" className="flex items-center gap-2 text-sm font-extrabold text-brand">
            <FuelIcon className="h-5 w-5 shrink-0" />
            وصل الآن
          </p>
          <button
            type="button"
            onClick={() => close(one.id)}
            aria-label="إغلاق"
            className="-m-2 p-2 text-slate-400"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-lg font-extrabold leading-relaxed text-slate-800">
          {one.product ? PRODUCT_LABELS[one.product] : 'وقود'}
        </p>
        <p className="mt-1 text-sm font-bold text-slate-700">{one.station_name}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {one.origin_city ?? one.cities?.[0]} · {agoLabel(one.send_at)}
        </p>

        <p
          className={`mt-3 rounded-xl p-2.5 text-[11px] leading-relaxed ${
            one.station_id ? 'bg-brand-50 text-brand-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {one.station_id
            ? 'محطة مسجّلة — لوحتها تؤكّد التوفّر الآن، وتختفي هذه الرسالة متى رفعتْه.'
            : 'محطة لم تنضمّ بعد — لا نعرف عنها إلا هذا الخبر. أكّده أو انفِه من الصفحة.'}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={one.station_id ? `/station/${one.station_id}` : '/'} className="btn-primary">
            {one.station_id ? 'افتح المحطة' : 'افتح المنصّة'}
          </a>
          <button type="button" onClick={() => close(one.id)} className="btn-ghost">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
