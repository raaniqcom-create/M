'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// Fixed reasons, no free-text-only path: a driver reporting from a forecourt
// will tap, not type, and a list keeps the admin's queue skimmable. The note is
// optional for the case the list does not cover.
const REASONS = [
  'الوقود غير متوفر رغم إعلانه',
  'المحطة مغلقة',
  'الأسعار مختلفة',
  'الموقع على الخريطة خاطئ',
  'رقم الهاتف لا يعمل',
  'سبب آخر',
];

export function ComplaintButton({ stationId }: { stationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    await supabase.from('complaints').insert({
      station_id: stationId,
      reason,
      note: note.trim() || null,
    });
    // fire-and-forget: a failed alert must not make the driver think their
    // report was lost. The row is already saved either way.
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ event: 'complaint', stationId, reason }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-medium text-brand-700">
        وصلتنا ملاحظتك، شكراً. ستراجعها الإدارة.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full py-2 text-xs font-semibold text-slate-400"
      >
        الإبلاغ عن مشكلة في هذه المحطة
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-bold text-slate-700">ما المشكلة؟</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            aria-pressed={reason === r}
            className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors duration-200 ${
              reason === r ? 'bg-brand-100 text-brand' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="تفاصيل إضافية (اختياري)"
        className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-base"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={submit} disabled={!reason || busy} className="btn-primary">
          إرسال
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          إلغاء
        </button>
      </div>
    </div>
  );
}
