'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { randomId } from '@/lib/uid';
import { ageLabel } from '@/lib/hours';
import { whatsappLink } from '@/lib/phone';
import { SpinnerIcon, WhatsappIcon } from './icons';

export interface ChatRow {
  id: string;
  station_id: string;
  sender: 'admin' | 'owner' | 'system';
  body: string;
  kind: string | null;
  read_at: string | null;
  created_at: string;
}

/** ساعةُ الصمت التي بعدها يُعرض واتساب — والحدُّ قرارُ المالك */
const STUCK_MS = 24 * 3600_000;

/** آخرُ خمسين. المجرى يعمّر بلا حدّ لأن التذكيرات الآلية تدخله يومياً،
 *  فالحدُّ هنا يمنع صفحةً تُحمّل ألفَ صفٍّ بعد سنة. */
const PAGE = 50;

/** هل يُعرض زرُّ واتساب؟
 *
 *  **لا يظهر على تذكيرٍ آليٍّ لم يُجَب.** سكوتُ صاحب المحطة عن رسالةٍ كتبها
 *  النظام هو الحال الطبيعية — وملاحقتُه عليها بواتساب إزعاجٌ بلا سبب. أمّا
 *  رسالةٌ كتبها إنسانٌ ومضى عليها يومٌ بلا ردّ فهي التي تستحقّ بابَ خروج.
 *
 *  مُصدَّرةٌ ليختبرها scripts/test-station-chat.mjs: القرارُ يخطئ صامتاً. */
export function isStuck(rows: ChatRow[], now = Date.now()): boolean {
  const last = rows.at(-1);
  if (!last || last.sender !== 'admin') return false;
  return now - Date.parse(last.created_at) > STUCK_MS;
}

/** أيُّ الرسائل يختمها هذا الطرف مقروءةً — ما وصله، لا ما كتبه. */
export function readableBy(as: 'admin' | 'owner', sender: ChatRow['sender']): boolean {
  return as === 'owner' ? sender !== 'owner' : sender === 'owner';
}

/** محادثةُ الإدارة وصاحب المحطة — مكوّنٌ واحد للطرفين.
 *
 *  زيادتا الإدارة (زرُّ واتساب وسطرُ الوصول) شرطان اثنان، وهو أرخص من مكوّنٍ
 *  ثانٍ يفترق عن هذا في أوّل تعديل.
 *
 *  **ولماذا هذا أسهل من واتساب:** ليس لأنه أسرع — بل لأن الرسالة تصل ومعها
 *  اسمُ المحطة وتاريخُ ما قيل لها، والإدارةُ ترى قبل أن تكتب ماذا قال لها
 *  النظامُ هذا الصباح. ورقمٌ في قائمةٍ طويلة لا يحمل شيئاً من ذلك. */
export function StationChat({
  stationId,
  as,
  phone,
  name,
}: {
  stationId: string;
  as: 'admin' | 'owner';
  /** للإدارة وحدها: بابُ الخروج إلى واتساب حين لا يُجاب */
  phone?: string | null;
  name?: string | null;
}) {
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  /** جوابُ الإيصال: sent=0 يعني أن لا جهازَ لهذه المحطة ولا تيليغرام */
  const [reach, setReach] = useState<number | null>(null);
  const foot = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('station_messages')
      .select('*')
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (error) {
      setFailed('تعذّر تحميل المحادثة.');
      return;
    }
    const list = (data as ChatRow[]).slice().reverse();
    setFailed(null);
    setRows(list);

    // ختمُ ما وصل. والمرشّحُ هنا يوفّر جولةً فارغة فقط — الصلاحياتُ في
    // القاعدة هي التي تمنع ختمَ ما كتبتَه أنت.
    const mine = list.filter((r) => readableBy(as, r.sender) && !r.read_at);
    if (mine.length) {
      await supabase
        .from('station_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', mine.map((r) => r.id));
    }
  }, [stationId, as]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── البثّ الحيّ ─────────────────────────────────────────────────────────
  //
  // اسمٌ فريد لازم: قناةٌ بنفس الاسم تعود بنفس النسخة، فتسقط المستمعات صامتةً
  // (lib/useSiteStats.ts). و INSERT وحده: الاشتراك على '*' يجعل كلَّ ختمِ
  // قراءةٍ يُعيد الجلب. والمرشّحُ لازمٌ لجهة الإدارة، إذ لا تُضيّق RLS مجراها.
  useEffect(() => {
    const ch = supabase
      .channel(`station-chat:${randomId()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'station_messages', filter: `station_id=eq.${stationId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [stationId, load]);

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'nearest' });
  }, [rows?.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setFailed(null);

    // المتصفّح يُدرج، والدالّةُ توصِل فقط. فإن سقط الدفع بقيت الرسالة في
    // المجرى — وهو أصدقُ أشكال الفشل: الكلامُ محفوظٌ وإن لم يرنّ هاتف.
    const { data, error } = await supabase
      .from('station_messages')
      .insert({ station_id: stationId, sender: as, body })
      .select('id')
      .single();

    if (error || !data) {
      setBusy(false);
      setFailed('تعذّر الإرسال. أعد المحاولة.');
      return;
    }
    setText('');
    await load();
    setBusy(false);

    if (as === 'admin') {
      const r = await callFn<{ sent: number }>(`owner-daily?deliver=${data.id}`);
      setReach(r.ok ? (r.data?.sent ?? 0) : null);
    } else {
      // «انظر»، لا «اقرأ هنا»: النصّ لا يُمرَّر، فمن يحمل المفتاح العامّ لا
      // يكتب على قفل شاشة الإدارة.
      void callFn('admin-alert', { event: 'message', stationId });
    }
  }

  const stuck = rows ? isStuck(rows) : false;
  const unreachable = reach === 0;
  const showWhatsapp = as === 'admin' && !!phone && (stuck || unreachable);
  const lastAdmin = rows?.filter((r) => r.sender === 'admin').at(-1);

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{as === 'admin' ? 'المحادثة مع صاحب المحطة' : 'الرسائل'}</h3>
        {as === 'owner' && (
          <span className="text-[10.5px] text-slate-400">إدارة المحطة التقنية</span>
        )}
      </div>

      {rows === null && !failed && (
        <div className="flex justify-center py-8">
          <SpinnerIcon className="h-5 w-5 text-brand" />
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-traffic-red">
          {failed}
        </p>
      )}

      {rows?.length === 0 && (
        <p className="mt-3 rounded-xl bg-brand-50/60 p-3 text-xs leading-relaxed text-slate-600">
          {as === 'admin'
            ? 'لا رسائل بعد. اكتب أوّل رسالة — تصل إلى صاحب المحطة على هاتفه، ويردّ من لوحته.'
            : 'لا رسائل بعد. اكتب هنا إن كان لديك سؤال أو أمرٌ تريد إبلاغ الإدارة به، ويصلك الردّ في هذه الصفحة.'}
        </p>
      )}

      {!!rows?.length && (
        <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pe-1">
          {rows.map((r) =>
            r.sender === 'system' ? (
              /* الآليّ بعرض المجرى ولونٍ محايد: هو خبرٌ من النظام لا طرفٌ في
                 الكلام. وموسومٌ مرّةً واحدة — ولا خريطةَ أسماءٍ للأنواع
                 السبعة، فالنصوصُ تقول نفسها. */
              <div key={r.id} className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-[9.5px] font-bold text-slate-400">رسالة تلقائية من المنصّة</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">{r.body}</p>
                <p className="mt-1 text-[9.5px] text-slate-400">{ageLabel(r.created_at)}</p>
              </div>
            ) : (
              <div
                key={r.id}
                className={`flex ${r.sender === as ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    r.sender === 'admin'
                      ? 'bg-brand-50 text-brand-900'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{r.body}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[9.5px] text-slate-400">
                    {r.sender === 'admin' ? 'الإدارة' : 'صاحب المحطة'} · {ageLabel(r.created_at)}
                    {r.sender === as && r.read_at && <span className="text-brand">· قُرئت</span>}
                  </p>
                </div>
              </div>
            )
          )}
          <div ref={foot} />
        </div>
      )}

      {/* لا جهازَ ولا تيليغرام: يُقال صراحةً بدل أن يُنتظر ردٌّ لن يأتي */}
      {as === 'admin' && unreachable && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-900">
          وصلت الرسالة إلى المجرى، لكن لا جهازَ مربوطاً لهذه المحطة ولا تيليغرام — فلن
          يرنّ هاتفُ صاحبها. استعمل واتساب أدناه، أو اطلب منه ربط جهازه.
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={as === 'admin' ? 'اكتب رسالتك…' : 'اكتب سؤالك أو ملاحظتك…'}
          className="field min-h-[44px] flex-1 resize-none py-2"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !text.trim()}
          className="btn-primary min-h-[44px] px-4 disabled:opacity-60"
        >
          {busy ? <SpinnerIcon className="h-4 w-4" /> : 'إرسال'}
        </button>
      </div>

      {showWhatsapp && lastAdmin && (
        <a
          href={`${whatsappLink(phone!, name).split('?')[0]}?text=${encodeURIComponent(lastAdmin.body)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost mt-2 w-full"
        >
          <WhatsappIcon className="h-4 w-4" />
          {stuck ? 'مضى يومٌ بلا ردّ — أرسلها على واتساب' : 'أرسلها على واتساب'}
        </a>
      )}
    </section>
  );
}
