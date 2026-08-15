import type { Metadata } from 'next';
import { FuelIcon, FacebookIcon, InstagramIcon, WhatsappIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'من نحن',
  description:
    'المحطة التقنية — منصة مجانية وُلدت من سؤال يتكرر كل يوم في الأنبار: أين يتوفر الوقود اليوم؟',
};

/** Verified live before shipping: all three resolve 200. A dead link on the
 *  page that asks people to get in touch is worse than no link at all. */
const CONTACTS = [
  { href: 'https://wa.me/9647844446633', label: 'واتساب', handle: '0784 444 6633', Icon: WhatsappIcon },
  { href: 'https://www.facebook.com/al3r18y', label: 'فيسبوك', handle: 'al3r18y', Icon: FacebookIcon },
  { href: 'https://www.instagram.com/al3r18y', label: 'إنستغرام', handle: 'al3r18y', Icon: InstagramIcon },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mb-6 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="text-center text-xl font-extrabold">من نحن</h1>
      <p className="mt-1 text-center text-sm font-bold text-brand">التقنية حق للجميع</p>

      <section className="card mt-5 space-y-4 p-5 text-sm leading-relaxed text-slate-700">
        <p>
          في أزمة الوقود التي مرّت بها الأنبار، كان السؤال نفسه يتكرر كل يوم:{' '}
          <strong>أين يتوفر البانزين اليوم؟</strong> والجواب يأتي من مكالمة، أو من منشور
          قديم، أو من طابور يقف فيه المرء ساعة ليكتشف أن المحطة أغلقت قبل دوره.
        </p>

        <p>
          المعلومة كانت موجودة — عند <strong>صاحب المحطة نفسه</strong> — لكن لا طريق
          يوصلها إلى الناس.
        </p>

        <p>
          من هنا وُلدت <strong>«المحطة التقنية»</strong>: صاحب المحطة يحدّث حالة التوفر
          بضغطة واحدة من هاتفه، فتصل لحظتها إلى كل من اختار مدينته ونوع الوقود الذي
          يهمّه. فيعرف قبل أن يتحرك، ولا يدور بين المحطات، ولا يقف في طابور قد ينتهي قبل
          دوره.
        </p>

        <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-900">
          المنصة <strong>مجانية بالكامل</strong> — لا رسوم على المستخدم ولا على المحطة،
          ولا نطلب حساباً ولا بيانات شخصية للتصفح.
        </p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-bold">الفكرة والتنفيذ</h2>
        <p className="mt-2 text-base font-extrabold text-brand-700">أحمد الرفاعي</p>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          لأي اقتراح أو ملاحظة، أو إن كنت صاحب محطة وتريد تسجيلها — تواصل معي مباشرة على
          أي من هذه:
        </p>

        <div className="mt-4 space-y-2">
          {CONTACTS.map(({ href, label, handle, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {label}
              </span>
              <span className="text-xs font-normal text-slate-400" dir="ltr">
                {handle}
              </span>
            </a>
          ))}
        </div>
      </section>

      <a href="/register" className="btn-primary mt-4 w-full">
        سجّل محطتك مجاناً
      </a>
      <a href="/" className="mt-2 block min-h-[44px] pt-3 text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
