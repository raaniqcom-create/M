'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckIcon, SpinnerIcon, XIcon } from './icons';
import type { StationReview } from '@/lib/reviews';

type Row = StationReview & { station: string };

/** The moderation queue. Nothing a driver writes reaches another driver until
 *  it passes through here — a rating is a claim about someone's livelihood,
 *  and a competitor with a phone is the cheapest attack there is. */
export function ReviewsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: reviews }, { data: stations }] = await Promise.all([
      supabase
        .from('station_reviews')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('stations').select('id, name'),
    ]);
    const names = new Map((stations ?? []).map((s) => [s.id, s.name as string]));
    setRows(
      ((reviews ?? []) as StationReview[]).map((r) => ({
        ...r,
        station: names.get(r.station_id) ?? '—',
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(id);
    setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
    await supabase
      .from('station_reviews')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(null);
  }

  if (rows === null) {
    return (
      <div className="flex justify-center py-10">
        <SpinnerIcon className="h-5 w-5 text-slate-400" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="card p-5 text-center text-sm text-slate-500">
        لا توجد تقييمات بانتظار المراجعة.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <article key={r.id} className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold">{r.station}</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                {new Date(r.created_at).toLocaleString('ar-IQ')}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-amber-500">
              {'★'.repeat(r.rating)}
              <span className="text-slate-200">{'★'.repeat(5 - r.rating)}</span>
            </span>
          </div>

          {r.comment && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
              {r.comment}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r.id, 'approved')}
              className="btn-primary flex-1"
            >
              <CheckIcon className="h-4 w-4" />
              نشر
            </button>
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r.id, 'rejected')}
              className="btn-ghost flex-1 text-red-600"
            >
              <XIcon className="h-4 w-4" />
              رفض
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
