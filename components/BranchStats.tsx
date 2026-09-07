'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { num } from '@/lib/num';
import { SpinnerIcon } from '@/components/icons';

/** أرقامُ الفرع — أعدادٌ بلا أشخاص.
 *
 *  ── ولماذا لا يُعاد استعمالُ AdminStats ──────────────────────────────────
 *
 *  لأنّ تلك تطبع أرقامَ هواتف الملّاك وأسماءهم ومعها زرُّ واتساب. وهذه اللوحةُ
 *  حسابٌ **مشترَك** يدخله أكثرُ من موظّف — فما يُعرض فيها يُعرض للفرع كلِّه.
 *  والحجبُ على الخادم لا هنا: `branch_stats()` لا تُخرج عموداً شخصيّاً أصلاً،
 *  فلو نُسخ هذا المكوّن يوماً إلى صفحةٍ أخرى لم يتسرّب شيء.
 *
 *  ── والرقمُ الذي جاء الفرعُ من أجله ─────────────────────────────────────
 *
 *  ليس «كم مشتركاً» بل **أين ينتظر الناسُ بلا محطة**: ثلاثَ عشرةَ منطقةً فيها
 *  منتظرون ولا محطةَ واحدةٌ معتمدةٌ فيها. وهو قرارُ توسّعٍ يخصّ فرعَ التوزيع
 *  وحدَه، ولا يُقرأ من جدولٍ مرتَّبٍ بالاسم — فيُفرَز ويُقدَّم. */

interface CityRow {
  city: string;
  stations: number;
  subscribers: number;
}

interface Stats {
  as_of: string;
  stations: { approved: number; pending: number };
  subscribers: number;
  devices: { ios: number; android: number; web: number };
  cities: CityRow[];
  notifications_30d: number;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
      <div className="text-[19px] font-extrabold tabular-nums text-brand-900" dir="ltr">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-bold text-slate-600">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

export function BranchStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('branch_stats');
      if (error) {
        // ٤٢٥٠١ خبرٌ آخرُ غيرِ انقطاع الشبكة، ولا يُخلطان: الأوّل يقول «لست
        // منهم» والثاني «حاول ثانيةً»، والخلطُ يُرسل الموظّفَ إلى الإدارة بلا سبب.
        setFailed(
          error.code === '42501'
            ? 'هذه الأرقام لموظّفي الفرع وإدارة المنصّة.'
            : 'تعذّر تحميل الأرقام. أعد فتح الصفحة.'
        );
        return;
      }
      setStats(data as Stats);
    })();
  }, []);

  if (failed) {
    return (
      <section className="card p-5 text-center">
        <p className="text-xs font-bold text-slate-600">{failed}</p>
      </section>
    );
  }
  if (!stats) {
    return (
      <div className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </div>
    );
  }

  const waiting = [...stats.cities]
    .filter((c) => c.stations === 0 && c.subscribers > 0)
    .sort((a, b) => b.subscribers - a.subscribers);
  const served = [...stats.cities]
    .filter((c) => c.stations > 0)
    .sort((a, b) => b.subscribers - a.subscribers);

  const at = new Date(stats.as_of).toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="مشترك" value={num(stats.subscribers)} hint="عنوانٌ مميَّز" />
        <Tile label="محطة معتمدة" value={num(stats.stations.approved)} hint={`و${num(stats.stations.pending)} بانتظار الاعتماد`} />
        <Tile
          label="جهاز"
          value={num(stats.devices.ios + stats.devices.android + stats.devices.web)}
          hint={`${num(stats.devices.android)} أندرويد · ${num(stats.devices.ios)} آيفون`}
        />
        <Tile label="إشعاراً في ٣٠ يوماً" value={num(stats.notifications_30d)} />
      </div>

      {waiting.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-extrabold text-brand-900">مناطق تنتظر ولا محطةَ فيها</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
            فيها مشتركون في المنصّة، ولا محطةَ معتمدةً واحدة — فلا يصلهم خبرُ توفّرٍ عن
            منطقتهم.
          </p>
          <ul className="mt-3 space-y-1">
            {waiting.map((c) => (
              <li
                key={c.city}
                className="flex items-center justify-between border-t border-slate-100 py-1.5 text-[12.5px] first:border-t-0"
              >
                <span className="font-bold text-slate-700">{c.city}</span>
                <span className="tabular-nums text-slate-500" dir="ltr">
                  {num(c.subscribers)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto p-4">
        <h2 className="text-sm font-extrabold text-brand-900">التوزيع على المناطق</h2>
        <table className="mt-3 w-full min-w-[18rem] text-right text-[12.5px]">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="pb-1 font-bold">المنطقة</th>
              <th className="pb-1 font-bold">محطات</th>
              <th className="pb-1 font-bold">مشتركون</th>
            </tr>
          </thead>
          <tbody>
            {served.map((c) => (
              <tr key={c.city} className="border-t border-slate-100">
                <td className="py-1.5 font-bold text-slate-700">{c.city}</td>
                <td className="py-1.5 tabular-nums text-slate-600" dir="ltr">
                  {num(c.stations)}
                </td>
                <td className="py-1.5 tabular-nums text-slate-600" dir="ltr">
                  {num(c.subscribers)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* من اختار «كلَّ المدن» يُحتسب في كلّ منطقة، فمجموعُ الأعمدة يفوق العدد
          الكلّيّ. ويُقال صراحةً: ورقةٌ يجمع قارئُها عمودَها فلا يطابق العنوانَ
          تفقد ثقتَه في بقيّة أرقامها. */}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        قُرئت {at}. ومن اختار «كلَّ المدن» يُحتسب في كلّ منطقةٍ ينتظرها، فمجموعُ
        المناطق يفوق العددَ الكلّيّ.
      </p>
    </div>
  );
}
