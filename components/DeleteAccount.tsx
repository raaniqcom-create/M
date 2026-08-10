'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// Apple 5.1.1(v): an account created in the app has to be deletable in the app.
// Deliberately awkward — typing the word is the only thing standing between a
// mis-tap and a station disappearing from every driver's screen.
const CONFIRM = 'حذف';

export function DeleteAccount({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('انتهت الجلسة، سجّل الدخول من جديد');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'تعذّر الحذف');

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="card border-red-100 p-5">
      <h3 className="text-sm font-bold text-red-600">حذف الحساب</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        يحذف حسابك ({phone}) ومحطتك وكل بياناتها نهائياً من المنصة. لا يمكن التراجع.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-600 active:bg-red-50"
        >
          حذف حسابي ومحطتي
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-bold text-slate-600">
            اكتب «{CONFIRM}» للتأكيد
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input mt-1 w-full text-base"
              autoComplete="off"
            />
          </label>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={typed.trim() !== CONFIRM || busy}
              onClick={remove}
              className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? 'جارٍ الحذف…' : 'تأكيد الحذف النهائي'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setTyped(''); setError(''); }}
              className="btn-ghost flex-1"
            >
              تراجع
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
