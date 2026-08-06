'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckIcon, LogOutIcon, MapPinIcon, SpinnerIcon, XIcon } from '@/components/icons';
import type { Station } from '@/types/database';

interface Ad {
  id: string;
  image_url: string;
  link_url: string;
  start_date: string;
  end_date: string;
  active: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'stations' | 'ads'>('stations');
  const [pending, setPending] = useState<Station[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);

  const load = useCallback(async () => {
    const [{ data: st }, { data: ad }] = await Promise.all([
      supabase.from('stations').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('ads').select('*').order('created_at', { ascending: false }),
    ]);
    setPending(st ?? []);
    setAds(ad ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profile?.role !== 'admin') {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      load();
    })();
  }, [router, load]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    setPending((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('stations').update({ status }).eq('id', id);
  }

  async function addAd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const { error } = await supabase.from('ads').insert({
      image_url: String(fd.get('image_url')),
      link_url: String(fd.get('link_url')),
      start_date: String(fd.get('start_date')),
      end_date: String(fd.get('end_date')),
    });
    if (!error) {
      form.reset();
      load();
    }
  }

  async function toggleAd(ad: Ad) {
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: !a.active } : a)));
    await supabase.from('ads').update({ active: !ad.active }).eq('id', ad.id);
  }

  if (allowed === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-slate-400" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-base font-bold">هذه الصفحة للإدارة فقط</h1>
        <p className="mt-2 text-sm text-slate-500">لا تملك صلاحية الوصول لهذه اللوحة.</p>
        <a href="/" className="btn-ghost mt-5 px-6">
          العودة للرئيسية
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-brand">لوحة الإدارة</h1>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/login');
          }}
          aria-label="تسجيل الخروج"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
        >
          <LogOutIcon />
        </button>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        {(['stations', 'ads'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t}
            className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors duration-200 ${
              tab === t ? 'bg-white text-brand shadow-soft' : 'text-slate-500'
            }`}
          >
            {t === 'stations' ? `طلبات المحطات (${pending.length})` : 'الإعلانات'}
          </button>
        ))}
      </div>

      {tab === 'stations' && (
        <div className="mt-4 space-y-3">
          {pending.length === 0 && (
            <p className="card p-6 text-center text-sm text-slate-400">لا توجد طلبات معلّقة</p>
          )}
          {pending.map((s) => (
            <article key={s.id} className="card p-4">
              <h2 className="text-base font-bold">{s.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{s.address}</p>
              <p className="mt-1 text-sm text-slate-500" dir="ltr">
                {s.phone}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand"
              >
                <MapPinIcon className="h-4 w-4" />
                عرض الموقع على الخريطة
              </a>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => decide(s.id, 'approved')}
                  className="btn bg-brand text-white"
                >
                  <CheckIcon className="h-4 w-4" />
                  موافقة
                </button>
                <button
                  type="button"
                  onClick={() => decide(s.id, 'rejected')}
                  className="btn border border-traffic-red bg-white text-traffic-red"
                >
                  <XIcon className="h-4 w-4" />
                  رفض
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'ads' && (
        <div className="mt-4 space-y-4">
          <form onSubmit={addAd} className="card space-y-3 p-5">
            <h2 className="text-sm font-bold">إضافة إعلان</h2>
            <div>
              <label htmlFor="image_url" className="label">
                رابط صورة الإعلان
              </label>
              <input
                id="image_url"
                name="image_url"
                type="url"
                required
                className="field"
                dir="ltr"
                placeholder="https://..."
              />
            </div>
            <div>
              <label htmlFor="link_url" className="label">
                رابط الوجهة
              </label>
              <input
                id="link_url"
                name="link_url"
                type="url"
                required
                className="field"
                dir="ltr"
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start_date" className="label">
                  من تاريخ
                </label>
                <input id="start_date" name="start_date" type="date" required className="field" />
              </div>
              <div>
                <label htmlFor="end_date" className="label">
                  إلى تاريخ
                </label>
                <input id="end_date" name="end_date" type="date" required className="field" />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              إضافة
            </button>
          </form>

          <div className="space-y-3">
            {ads.map((ad) => (
              <article key={ad.id} className="card overflow-hidden">
                {/* admin-supplied URL, no optimization pipeline — plain img is right here */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.image_url} alt="" className="h-24 w-full object-cover" />
                <div className="flex items-center justify-between p-3">
                  <span className="text-xs text-slate-500" dir="ltr">
                    {ad.start_date} → {ad.end_date}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleAd(ad)}
                    aria-pressed={ad.active}
                    className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold ${
                      ad.active ? 'bg-brand-100 text-brand' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {ad.active ? 'مفعّل' : 'موقوف'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
