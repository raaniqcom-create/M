'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { deviceId } from '@/lib/vote';
import { agoLabel } from '@/lib/freshness';
import { useAlertChoice } from '@/lib/alerts';
import { PRODUCT_LABELS } from '@/lib/products';
import { CheckIcon, XIcon } from './icons';
import type { FuelProduct } from '@/types/database';

interface Row {
  id: string;
  station_name: string;
  origin_city: string | null;
  product: FuelProduct | null;
  cities: string[] | null;
  send_at: string;
  yes_votes: number;
  no_votes: number;
}

const VOTED = 'ann-vote:';

/** وقودٌ في محطة لم تنضمّ بعد — ويعرفه الناس لا نحن.
 *
 *  الإدارة تُعلن عن هذه المحطات إشعاراً، فيصل الخبر ثم يختفي: من فتح هاتفه بعد
 *  ساعة لا يجد له أثراً. فيبقى هنا طوال اليوم.
 *
 *  وأحمرُ لا أخضر، عن قصد. المحطة المسجّلة تقول متى تفتح وماذا لديها ومتى نفد،
 *  وصاحبها مسؤول عن كلمته. وهذه لا نعرف عنها إلا لحظةً واحدة مضت — فلا يُعرض
 *  خبرها بلون الثقة، ويُكتب عمره بجانبه دائماً.
 *
 *  ومن يُغلقه هم من وقفوا في الطابور: أربعة يقولون «نفد» فيختفي. ولا يُصدَّق
 *  أربعةٌ في وجه عشرين — الشرط في القاعدة يقارن الكفّتين، وإلا صار الزرّ سلاحاً
 *  بيد منافس بدل أن يكون تصحيحاً من مواطن. */
export function UnregisteredBoard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<Record<string, 'yes' | 'no'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { choice } = useAlertChoice();

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('open_announcements');
    if (error) return setRows([]);
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    load();
    // ما صوّته هذا الجهاز — ليُعرض مختاراً بدل أن يبدو الزرّ بلا أثر.
    try {
      const found: Record<string, 'yes' | 'no'> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(VOTED)) {
          const v = localStorage.getItem(k);
          if (v === 'yes' || v === 'no') found[k.slice(VOTED.length)] = v;
        }
      }
      setMine(found);
    } catch {
      /* وضع خاص: الأزرار تعمل، ولا يُتذكّر ما اختير */
    }
  }, [load]);

  async function vote(id: string, verdict: 'yes' | 'no') {
    setBusy(id);
    const { error } = await supabase.rpc('vote_announcement', {
      p_id: id,
      p_device: deviceId(),
      p_verdict: verdict,
    });
    setBusy(null);
    if (error) return;
    setMine((m) => ({ ...m, [id]: verdict }));
    try {
      localStorage.setItem(VOTED + id, verdict);
    } catch {
      /* لا يُتذكّر، والصوت محفوظ في الخادم على أي حال */
    }
    // يُعاد التحميل: صوتُه قد يكون الرابع الذي يُخفي الصفّ.
    load();
  }

  // من اختار مدينته لا يعنيه خبرُ مدينة أخرى — ونعتمد جمهور الإشعار نفسه
  // (cities) لا موقع المحطة، لأنه هو من قرّرت الإدارة أن الخبر يعنيه.
  const picked = choice?.cities?.length ? choice.cities : null;
  const visible = (rows ?? []).filter(
    (r) => !picked || !r.cities?.length || r.cities.some((c) => picked.includes(c))
  );

  if (!visible.length) return null;

  return (
    <section className="mt-4 rounded-2xl border-2 border-traffic-red bg-red-50 p-4">
      <h2 className="text-sm font-extrabold text-traffic-red">
        محطات غير مسجّلة لدينا — أعلنت توفّر وقود
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-red-900/80">
        وصلنا الخبر وأرسلناه، ولا نعرف أكثر منه: لا متى نفد، ولا الازدحام، ولا أوقات
        الدوام. أنت من يعرف — أخبِر بقيّة الناس.
      </p>

      <ul className="mt-3 space-y-2">
        {visible.map((r) => (
          <li key={r.id} className="rounded-xl bg-white p-3">
            <p className="text-sm font-bold leading-relaxed text-slate-800">
              <span className="text-traffic-red">{r.origin_city ?? r.cities?.[0]}</span>
              {' — '}
              {r.product ? PRODUCT_LABELS[r.product] : 'وقود'}
              {' — '}
              {r.station_name}
              <span className="font-normal text-slate-400"> ({agoLabel(r.send_at)})</span>
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => vote(r.id, 'yes')}
                className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                  mine[r.id] === 'yes'
                    ? 'bg-brand text-white'
                    : 'bg-brand-50 text-brand-900 ring-1 ring-brand-100'
                }`}
              >
                <CheckIcon className="h-3.5 w-3.5" />
                ما زال متوفراً
                {r.yes_votes > 0 && <span className="font-normal">({r.yes_votes})</span>}
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => vote(r.id, 'no')}
                className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                  mine[r.id] === 'no'
                    ? 'bg-traffic-red text-white'
                    : 'bg-white text-traffic-red ring-1 ring-red-200'
                }`}
              >
                <XIcon className="h-3.5 w-3.5" />
                نفد
                {r.no_votes > 0 && <span className="font-normal">({r.no_votes})</span>}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-red-900/70">
        هذه المحطات لم تسجّل بعد، فلا تستطيع تحديث بياناتها بنفسها. المحطة المسجّلة
        تُعلن ما لديها وأوقات دوامها وتصحّحها لحظةً بلحظة.
      </p>
    </section>
  );
}
