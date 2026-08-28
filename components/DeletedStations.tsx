'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ageLabel } from '@/lib/hours';
import { SpinnerIcon } from './icons';

interface Gone {
  id: string;
  name: string;
  city: string;
  phone: string;
  status: string;
  deleted_at: string;
  lost: { followers?: number; devices?: number; reviews?: number; messages?: number } | null;
}

/** المحطاتُ المحذوفة، وبابُ عودتها.
 *
 *  **سببُها حادثةٌ وقعت.** «محطة وقود المرزوق» اعتُمدت ثمّ حُذف صفُّها، فلم
 *  يبقَ منها أثرٌ واحد — واستُعيدت لأن المالك تذكّر بياناتها ولأن اسمها صادف
 *  وجودَه في بيانات الخرائط. ومرّتان قبلها لا يُعرف لهما اسم.
 *
 *  فصار المشغِّلُ ينسخ الصفَّ قبل محوه، وهذه القائمةُ تُظهر ما نُسخ. ولا تظهر
 *  إن كان الأرشيفُ فارغاً: لوحةٌ تحمل قسماً فارغاً دائماً تُعلّم العينَ أن
 *  تتخطّاه، فلا يُرى يومَ يمتلئ. */
export function DeletedStations() {
  const [rows, setRows] = useState<Gone[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('deleted_stations');
    // الهجرةُ قد لا تكون طُبِّقت بعد — فتسكت القائمة ولا تُسقط اللوحة
    setRows(error ? [] : ((data ?? []) as Gone[]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(g: Gone) {
    if (!confirm(`استرجاع «${g.name}»؟ تعود ببياناتها ومنتجاتها ومعرّفها القديم.`)) return;
    setBusy(g.id);
    const { error } = await supabase.rpc('restore_station', { p_id: g.id });
    setBusy(null);
    if (error) {
      setNote(`تعذّر الاسترجاع: ${error.message}`);
      return;
    }
    setNote(`عادت «${g.name}». حدّث الصفحة لتظهر في القائمة.`);
    void load();
  }

  if (rows === null || rows.length === 0) return null;

  return (
    <section className="card mt-4 border-traffic-yellow bg-amber-50 p-4">
      <h3 className="text-sm font-extrabold text-amber-900">
        محطات محذوفة ({rows.length})
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80">
        نُسخت قبل محوها. الاسترجاع يعيد البيانات والمنتجات بالمعرّف نفسِه، فتعمل
        روابطُها القديمة — <b>ولا تعود المتابعات ولا الأجهزة المربوطة</b>.
      </p>

      {note && (
        <p className="mt-2 rounded-lg bg-white/80 p-2.5 text-[11px] font-bold text-amber-900">{note}</p>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((g) => {
          const lost = g.lost ?? {};
          const bits = [
            lost.followers ? `${lost.followers} متابعاً` : null,
            lost.devices ? `${lost.devices} جهازاً` : null,
            lost.messages ? `${lost.messages} رسالة` : null,
          ].filter(Boolean);
          return (
            <li key={g.id} className="rounded-xl bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold text-slate-800">{g.name}</p>
                  <p className="text-[10.5px] text-slate-500">
                    {g.city} · <span dir="ltr">{g.phone}</span> · حُذفت {ageLabel(g.deleted_at)}
                  </p>
                  {bits.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-traffic-red">
                      ضاع معها {bits.join(' و')} — لا تعود بالاسترجاع
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => restore(g)}
                  disabled={busy === g.id}
                  className="btn-primary shrink-0 px-3 py-1.5 text-[11px] disabled:opacity-60"
                >
                  {busy === g.id ? <SpinnerIcon className="h-3.5 w-3.5" /> : 'استرجاع'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
