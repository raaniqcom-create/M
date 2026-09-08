'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCT_LABELS } from '@/lib/products';
import { SpinnerIcon } from './icons';
import {
  applyOverrides,
  baghdadDate,
  boardDate,
  buildBoard,
  loadBoardStations,
  loadOverrides,
  loadSchedule,
  type BoardRow,
} from '@/lib/scheduleData';

/** التحكّمُ بجدول الوقود من لوحة الإدارة.
 *
 *  ── ولماذا شاشةٌ ثانيةٌ والبوتُ فيه أزرار ────────────────────────────────
 *
 *  البوتُ حيث يقف المشغّل: هاتفٌ في جيبه وهو في الطريق، وضغطتان. وهذه حيث
 *  ينظر: الجدولُ كلُّه في شاشةٍ واحدةٍ يُراجَع ويُصحَّح دفعةً. والقاعدةُ واحدةٌ
 *  تخدمهما — `board_overrides` — فلا تختلف الشاشتان فيما تقولانه.
 *
 *  ── وتعرض ما يراه الناسُ لا ما نُشر ─────────────────────────────────────
 *
 *  تبني اللوحةَ بالمنطق نفسِه الذي تبنيه به `/schedule` — `buildBoard` ثمّ
 *  `applyOverrides`. فما يظهر هنا هو ما يظهر هناك حرفاً بحرف، ولو عُرضت صفوفُ
 *  `fuel_schedule` وحدَها لاختلفتا: نشرُ الجدول يكتب وعداً في لوحة المحطة،
 *  فيدخل السطرُ من مصدرها ويُبتلع سطرُ القناة فيه.
 *
 *  ── ولا يُحذف صفٌّ نُشر ──────────────────────────────────────────────────
 *
 *  ما نُشر وقع، والسجلُّ يبقى. العلامةُ تُكتب وتُرفع فيعود السطر. */
type Mark = 'hide' | 'out';

const STATE_LABEL: Record<BoardRow['state'], string> = {
  arrived: 'وصل ✓',
  expected: 'متوقّع',
  out: 'نفد',
};

export function ScheduleAdmin() {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [raw, setRaw] = useState<BoardRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const day = boardDate();

  const load = useCallback(async () => {
    try {
      const schedule = await loadSchedule();
      const stations = await loadBoardStations(day, schedule);
      const built = buildBoard(schedule, stations, day);
      setRaw(built);
      setRows(applyOverrides(built, await loadOverrides(), day));
      setNote(null);
    } catch {
      setNote('تعذّر جلب الجدول. أعد المحاولة.');
      setRows([]);
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  /** يكتب علامةً أو يرفعها. و`load` بعدها لا تحديثٌ متفائل: العلامةُ تُطبَّق
   *  في الخادم على صفوفٍ قد تزيد عمّا ضُغط — والشاشةُ تعرض ما وقع لا ما قُصد. */
  async function mark(row: BoardRow, action: Mark | null) {
    setBusy(row.key);
    setNote(null);

    // نداءٌ واحدٌ لكلٍّ من الوضع والرفع — ولا مسحٌ مباشر: `board_overrides`
    // لا منحَ كتابةٍ فيها لـ`authenticated` بالتصميم، والبابُ دالّةٌ تفحص
    // الدور. وقد كُتبت هذه الشاشةُ أوّلاً بمسحٍ مباشرٍ فكان زرّاً لا يفعل
    // شيئاً — والدالّةُ صارت تُبدّل بنفسها.
    const { error } = action
      ? await supabase.rpc('set_board_override', {
          p_for_date: day,
          p_action: action,
          p_city: row.city,
          p_station_id: row.stationId,
          p_station_name: row.name,
          p_product: row.product,
        })
      : await supabase.rpc('clear_board_override_for', {
          p_for_date: day,
          p_city: row.city,
          p_station_id: row.stationId,
          p_station_name: row.name,
          p_product: row.product,
        });

    if (error) {
      setNote('تعذّر التعديل — تأكّد أنّك داخلٌ بحساب الإدارة.');
      setBusy(null);
      return;
    }

    await load();
    setBusy(null);
  }

  if (rows === null) {
    return (
      <div className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  // المخفيُّ لا يظهر في `rows` — فيُستخرج بالفرق، وإلا صار الإخفاءُ طريقاً
  // بلا عودة: من أخفى سطراً لا يجد زرّاً يُعيده.
  const shown = new Set(rows.map((r) => r.key));
  const hidden = raw.filter((r) => !shown.has(r.key));
  const when = day === baghdadDate() ? 'اليوم' : 'غداً';

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h2 className="text-sm font-extrabold text-brand-900">جدول {when}</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
          ما يراه الناسُ الآن — لا ما نُشر. والإخفاءُ يومُه وحدَه، ولا يُحذف صفٌّ
          نُشر: يُرفع فيعود.
        </p>
        {note && <p className="mt-2 text-[11.5px] font-bold text-traffic-red">{note}</p>}
      </div>

      {!rows.length && !hidden.length && (
        <div className="card p-8 text-center text-sm text-slate-500">لا جدولَ {when} بعد.</div>
      )}

      {rows.map((r) => (
        <div key={r.key} className="card flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-brand-900">{r.name}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {r.city ?? 'منطقةٌ لم تُذكر'} · {PRODUCT_LABELS[r.product]} ·{' '}
              <span className={r.state === 'out' ? 'text-slate-400' : 'text-brand-700'}>
                {STATE_LABEL[r.state]}
              </span>
              {r.source === 'station' && ' · من لوحة المحطة'}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={busy === r.key}
              onClick={() => mark(r, 'out')}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-50"
            >
              نفد
            </button>
            <button
              type="button"
              disabled={busy === r.key}
              onClick={() => mark(r, 'hide')}
              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-traffic-red disabled:opacity-50"
            >
              أخفِ
            </button>
          </div>
        </div>
      ))}

      {hidden.length > 0 && (
        <div className="card p-3">
          <h3 className="text-[12px] font-extrabold text-slate-500">
            مخفيٌّ عن الناس ({hidden.length})
          </h3>
          {hidden.map((r) => (
            <div key={r.key} className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-slate-400 line-through">
                  {r.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {r.city ?? '؟'} · {PRODUCT_LABELS[r.product]}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === r.key}
                onClick={() => mark(r, null)}
                className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700 disabled:opacity-50"
              >
                أعِده
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
