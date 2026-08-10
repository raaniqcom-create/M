'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FuelIcon } from '@/components/icons';
import { SoonBadge } from '@/components/SoonBadge';
import { useNativeApp } from '@/lib/useNativeApp';

// A stable redirect to whatever the newest signed build is — no need to touch
// this page when a new APK ships.
const APK_URL = 'https://github.com/raaniqcom-create/M/releases/latest/download/muhta.apk';

type Platform = 'android' | 'ios' | 'other';

function detect(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS 13+ reports itself as a Mac, so touch support disambiguates
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  return 'other';
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-slate-700">{children}</span>
    </li>
  );
}

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [installed, setInstalled] = useState(false);
  const native = useNativeApp();
  const router = useRouter();

  // Inside a shell this page is worse than useless: it offers an APK, names
  // the other platform, and tells iPhone users the real experience is the
  // website in Safari — the whole argument against the app they are holding.
  useEffect(() => {
    if (native) router.replace('/');
  }, [native, router]);

  useEffect(() => {
    setPlatform(detect());
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
  }, []);

  const android = (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <span className="text-xl">🤖</span>
        <h2 className="text-base font-bold">أندرويد</h2>
      </div>

      <a
        href={APK_URL}
        className="btn-primary mt-4 w-full"
        // the browser must download the file rather than try to render it
        download
      >
        تحميل التطبيق (٤.٤ ميغابايت)
      </a>

      <ol className="mt-4 space-y-3">
        <Step n={1}>اضغط زر التحميل أعلاه وانتظر انتهاء التنزيل.</Step>
        <Step n={2}>افتح الملف من شريط الإشعارات أو من مجلد التنزيلات.</Step>
        <Step n={3}>
          سيظهر تحذير <span className="font-semibold">«مصدر غير معروف»</span> — اضغط{' '}
          <span className="font-semibold">«الإعدادات»</span> ثم فعّل{' '}
          <span className="font-semibold">«السماح من هذا المصدر»</span>.
        </Step>
        <Step n={4}>ارجع واضغط «تثبيت». ستجد أيقونة المحطة التقنية على شاشتك.</Step>
      </ol>

      <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
        التحذير طبيعي لأي تطبيق يُثبَّت خارج المتجر ولا يعني وجود خطر. التطبيق موقّع رقمياً
        باسم المحطة التقنية.
      </p>
    </section>
  );

  const ios = (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <span className="text-xl">🍎</span>
        <h2 className="text-base font-bold">آيفون وآيباد</h2>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        آبل لا تسمح بتثبيت التطبيقات خارج متجرها، لكن يمكنك إضافة المنصة لشاشتك الرئيسية
        بخطوتين — وستعمل بملء الشاشة تماماً كأي تطبيق.
      </p>

      <ol className="mt-4 space-y-3">
        <Step n={1}>
          افتح <span className="font-semibold">muhta.online</span> في متصفح{' '}
          <span className="font-semibold">سفاري</span> تحديداً (لا كروم).
        </Step>
        <Step n={2}>
          اضغط زر المشاركة{' '}
          <span aria-hidden className="mx-0.5 font-bold text-brand">
            ⎋
          </span>{' '}
          في شريط الأدوات أسفل الشاشة.
        </Step>
        <Step n={3}>
          مرّر للأسفل واختر{' '}
          <span className="font-semibold">«إضافة إلى الشاشة الرئيسية»</span>.
        </Step>
        <Step n={4}>اضغط «إضافة» في الأعلى. ستظهر الأيقونة على شاشتك.</Step>
      </ol>

      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        تنبيهات آيفون أضعف من أندرويد بسبب قيود آبل. لتصلك تنبيهات فورية عند وصول الوقود،
        استخدم بوت تيليجرام أدناه.
      </p>
    </section>
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

      <section className="card mt-5 border-brand-100 p-5 text-center">
        <SoonBadge />
        <p className="mt-3 text-sm font-bold">المنصة تنطلق قريباً</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          حمّل التطبيق من الآن. وإن كنت صاحب محطة، سجّلها لتظهر للسائقين من أول يوم.
        </p>
        <a href="/register" className="btn-primary mt-4 w-full">
          سجّل محطتك مجاناً
        </a>
      </section>

      {installed && (
        <p className="mt-5 rounded-xl bg-brand-50 p-3 text-center text-sm font-semibold text-brand">
          ✅ التطبيق مثبّت لديك بالفعل
        </p>
      )}

      {/* the user's own platform first — the other stays available for sharing */}
      <div className="mt-5 space-y-4">
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

        <section className="card p-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <h2 className="text-base font-bold">بوت تيليجرام</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            يعمل على كل الأجهزة. يخبرك بأقرب المحطات، وما يتوفر فيها الآن، وينبهك فور وصول
            الوقود لمحطتك المفضلة.
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
      </div>

      <a href="/" className="mt-6 block text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
