'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ageLabel } from '@/lib/hours';
import { whatsappRequestDetails, whatsappResumeRegistration } from '@/lib/phone';
import { SpinnerIcon } from './icons';

interface Attempt {
  phone: string;
  created_at: string;
  signed_in: boolean;
}

/** محاولاتُ تسجيلٍ لم تكتمل — طابورُ متابعة.
 *
 *  ── ولماذا ليست «طلباتِ تسجيل» ──────────────────────────────────────────
 *
 *  لأنّ تفاصيلَها لم تُحفظ قطّ: الاسمُ والعنوانُ والإحداثيّاتُ كانت في متصفّح
 *  صاحبها حتى لحظة الإدراج — والإدراجُ هو الذي سقط. فلا صفَّ محطةٍ معلَّقاً
 *  يُراجَع، ولا اسمَ يُقرأ. الباقي رقمُ هاتفه ووقتُ محاولته.
 *
 *  ولا تُصطنع صفوفٌ بأسماءٍ وهميّة: صفٌّ في `stations` يُعدّ في الإحصاءات
 *  ويُقارَب في المطابقة، وقد يُعتمد بالسهو فيصير محطةً عامّةً بلا موقع.
 *
 *  فهذه قائمةُ اتّصال: رقمٌ ووقتٌ وزرٌّ يفتح واتساب برسالةٍ جاهزة. والتفاصيلُ
 *  تُؤخذ منه، ثمّ يُكمل هو تسجيلَه بنفسه — فتصل كاملةً صحيحةً بيده.
 *
 *  وتختفي من القائمة وحدَها متى أكمل: الدالّةُ تقرأ من لا محطةَ له. */
export function FailedRegistrations() {
  const [rows, setRows] = useState<Attempt[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('failed_registrations');
    // الهجرةُ قد لا تكون طُبِّقت بعد — فتسكت القائمة ولا تُسقط اللوحة.
    setRows(error ? [] : ((data ?? []) as Attempt[]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) {
    return (
      <section className="card p-4">
        <SpinnerIcon className="h-4 w-4" />
      </section>
    );
  }

  // قسمٌ فارغٌ دائماً تتعلّم العينُ تخطّيه فلا يُرى يومَ يمتلئ — كما في
  // `DeletedStations`.
  if (!rows.length) return null;

  return (
    <section className="card space-y-3 p-4">
      <header>
        <h2 className="text-sm font-extrabold text-brand-900">
          محاولاتُ تسجيلٍ لم تكتمل{' '}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
            {rows.length}
          </span>
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          أنشأ صاحبُها حساباً ولم يُكمل تسجيلَ محطته. <b>تفاصيلُ المحطة لم تُحفظ</b> — اتّصل به
          ليُكمل التسجيلَ بالرقم وكلمة المرور نفسها.
        </p>
      </header>

      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.phone} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold text-brand-900" dir="ltr">
                {r.phone}
              </p>
              <p className="text-[11px] text-slate-500">
                {ageLabel(r.created_at)}
                {!r.signed_in && ' · لم يدخل قطّ'}
              </p>
            </div>
            {/* **رسالتان، وأيُّهما يُرسَل يتبع حالَه.**
                من أنشأ حساباً ولم يدخل قطّ لا يعرف أنّ له حساباً — فيُطلب منه
                التفاصيلُ وتُصنع محطتُه بيد الإدارة. ومن دخل يعرف كلمةَ مروره،
                فأقصرُ طريقٍ أن يُكمل هو تسجيلَه بها. */}
            <a
              href={whatsappRequestDetails(r.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[36px] shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 pt-2 text-[11px] font-extrabold text-amber-900"
            >
              اطلب التفاصيل
            </a>
            <a
              href={whatsappResumeRegistration(r.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[36px] shrink-0 rounded-lg border border-brand-100 px-2.5 pt-2 text-[11px] font-extrabold text-brand-700 active:bg-brand-50"
            >
              أكمِل بنفسك
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(r.phone);
                setCopied(r.phone);
              }}
              className="min-h-[36px] shrink-0 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold text-slate-600"
            >
              {copied === r.phone ? 'نُسخ' : 'انسخ'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
