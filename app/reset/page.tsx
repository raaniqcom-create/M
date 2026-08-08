import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'استعادة كلمة المرور | المحطة التقنية',
  description: 'استعد الدخول إلى لوحة محطتك على المحطة التقنية.',
};

// Accounts here are keyed by phone number, not email — there is no inbox to
// send a reset link to. Until the SMS gateway is wired, the bot already knows
// how to verify a phone (it does it for station management), so it is the
// honest route rather than a form that cannot deliver anything.
export default function ResetPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-xl font-extrabold">نسيت كلمة المرور</h1>
        <p className="mt-1 text-sm text-slate-500">
          حسابك مرتبط برقم هاتف المحطة، لا ببريد إلكتروني — لذا تتم الاستعادة بالتحقق من الرقم.
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-bold">عبر بوت تيليجرام</h2>
          <ol className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600">
            <li>١. افتح البوت واضغط «إدارة محطتي».</li>
            <li>٢. شارك رقم هاتفك المسجّل — يتحقق منه البوت فوراً.</li>
            <li>٣. اطلب كلمة مرور جديدة، وتصلك في المحادثة نفسها.</li>
          </ol>
        </div>

        <a
          href="https://t.me/muhtaonlinebot"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full"
        >
          فتح البوت
        </a>

        <p className="text-xs leading-relaxed text-slate-500">
          لا يُنشر رقمك ولا يُشارك مع أحد؛ يُطابَق مع الرقم المسجّل للمحطة فقط.
        </p>
      </section>

      <a href="/login" className="btn-ghost mt-4 w-full">
        العودة لتسجيل الدخول
      </a>
    </main>
  );
}
