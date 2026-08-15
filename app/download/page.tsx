'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AndroidIcon, AppleIcon, CheckIcon, FuelIcon, MessageIcon } from '@/components/icons';
import { useNativeApp } from '@/lib/useNativeApp';
import { APP_STORE_URL, PLAY_STORE_URL, detectPlatform, type Platform } from '@/lib/stores';

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [installed, setInstalled] = useState(false);
  const native = useNativeApp();
  const router = useRouter();

  // Inside a shell this page is worse than useless: it offers the app to
  // someone already holding it.
  useEffect(() => {
    if (native) router.replace('/');
  }, [native, router]);

  useEffect(() => {
    setPlatform(detectPlatform());
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
  }, []);

  const android = (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="card flex items-center gap-4 p-5"
    >
      <AndroidIcon className="h-7 w-7 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">أندرويد</span>
        <span className="block text-xs text-slate-500">من Google Play — مجاناً</span>
      </span>
      <span className="btn-primary shrink-0 px-4 py-2 text-sm">تحميل</span>
    </a>
  );

  const ios = (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="card flex items-center gap-4 p-5"
    >
      <AppleIcon className="h-7 w-7 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">آيفون وآيباد</span>
        <span className="block text-xs text-slate-500">من App Store — مجاناً</span>
      </span>
      <span className="btn-primary shrink-0 px-4 py-2 text-sm">تحميل</span>
    </a>
  );

  if (native) return null;

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mb-6 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="text-center text-xl font-extrabold">حمّل التطبيق</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        مجاناً — بدون حساب، وبدون إعلانات مزعجة
      </p>

      {installed && (
        <p className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-brand-50 p-3 text-center text-sm font-semibold text-brand">
          <CheckIcon className="h-4 w-4" />
          التطبيق مثبّت لديك بالفعل
        </p>
      )}

      {/* the visitor's own platform first — the other stays for sharing */}
      <div className="mt-5 space-y-3">
        {platform === 'ios' ? (
          <>
            {ios}
            {android}
          </>
        ) : (
          <>
            {android}
            {ios}
          </>
        )}
      </div>

      <section className="card mt-4 p-5">
        <div className="flex items-center gap-2">
          <MessageIcon className="h-5 w-5 text-slate-400" />
          <h2 className="text-base font-bold">بوت تيليجرام</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          حالياً للمحطات فقط — يحدّث صاحب المحطة التوفر من تيليجرام بلا تحميل تطبيق.
        </p>
        <a
          href="https://t.me/muhtaonlinebot"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost mt-4 w-full"
        >
          فتح البوت
        </a>
      </section>

      <section className="card mt-4 border-brand-100 p-5 text-center">
        <p className="text-sm font-bold">صاحب محطة؟</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          سجّل محطتك مجاناً لتظهر للمستخدمين، وحدّث توفر الوقود بضغطة واحدة.
        </p>
        <a href="/register" className="btn-primary mt-4 w-full">
          سجّل محطتك مجاناً
        </a>
      </section>

      <a href="/" className="mt-6 block text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
