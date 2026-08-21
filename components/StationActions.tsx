'use client';

import { useEffect, useState } from 'react';
import { formatTime, isOpenNow } from '@/lib/hours';
import { PhoneIcon } from './icons';
import { RouteButton } from './RouteButton';

interface Hours {
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed?: boolean | null;
}

/** زرّا المحطة: الاتصال والطريق — والاتصال يتبع الدوام.
 *
 *  كان زرّ الاتصال يظهر على محطة مغلقة، فيتّصل الناس بمن لا يردّ. وهو نفس عيب
 *  الزرّ الذي يَعِد بما لا يقع: يُقرأ على أنه دعوة، ويُنفَق عليه وقتٌ ورصيد،
 *  وينتهي بصامتٍ على الطرف الآخر.
 *
 *  فثلاث حالات لا حالتان: مفتوحة برقم ظاهر → اتصال. مغلقة برقم ظاهر → لا زرّ
 *  بل سطرٌ يقول متى يعود. ورقمٌ مخفيّ → الطريق وحده يملأ العرض، كما كان.
 *
 *  والحساب في المتصفّح لا في البناء: الموقع تصدير ثابت، وisOpenNow تقرأ
 *  الساعة — فبناءٌ في الثالثة فجراً يخبز «مغلقة» في صفحة تُقرأ ظهراً. */
export function StationActions({
  phone,
  hours,
  lat,
  lng,
  stationId,
  stationName,
}: {
  phone?: string | null;
  hours: Hours;
  lat: number;
  lng: number;
  stationId?: string;
  stationName?: string;
}) {
  // يبدأ null ثم يُحسب بعد التركيب: الخادم لا يعرف ساعة القارئ، وتخمينُها
  // يُنتج اختلافاً بين ما بُني وما يُعرض.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => setOpen(isOpenNow({ ...hours, temp_closed: hours.temp_closed ?? false })), [hours]);

  // قبل أن تُعرف الساعة، يُعرض الطريق وحده — لا زرّ اتصال قد يكون كاذباً.
  const showCall = Boolean(phone) && open === true;

  return (
    <>
      <div className={`mt-3 grid gap-2 ${showCall ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showCall && (
          <a href={`tel:${phone}`} className="btn-ghost">
            <PhoneIcon className="h-4 w-4" />
            اتصال
          </a>
        )}
        <RouteButton lat={lat} lng={lng} stationId={stationId} stationName={stationName} />
      </div>

      {phone && open === false && (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          {hours.temp_closed
            ? 'المحطة مغلقة مؤقتاً — الاتصال متاح حين تعود'
            : `الاتصال متاح عند الفتح ${formatTime(hours.opens_at)}`}
        </p>
      )}
    </>
  );
}
