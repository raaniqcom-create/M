'use client';

import { usePathname } from 'next/navigation';
import { useNativeApp } from '@/lib/useNativeApp';

/** «‹ رجوع» في أعلى كلّ صفحةٍ داخليّة — لا في الرئيسية ولا في اللوحات.
 *
 *  «اشتكى المستخدمون بعدم وجود زر عودة عند دخولهم في أروقة النظام»: تطبيقُ
 *  آيفون بلا شريطِ متصفّحٍ ولا إيماءةِ رجوع، وأندرويد بلا @capacitor/app.
 *  فالزرُّ يُرسَم — مرّةً واحدةً هنا من التخطيط، لا في كلّ صفحةٍ على حدة.
 *
 *  يرجع في التاريخ إن جاء من صفحةٍ عندنا، وإلّا (رابطٌ مشارَك، إشعار، بحث)
 *  فالرابطُ نفسُه يذهب إلى الرئيسية — لا نقرةَ ميّتة. والحرفُ «‹» ينعكس في
 *  RTL فيشير إلى اليمين، كما في «‹ الرئيسية» في لوحتَي المالك والإدارة.
 *  و<nav> عمداً: طباعةُ /privacy و/branch تُخفي nav فلا يُطبع الزرّ.
 *
 *  اللوحاتُ (/owner، /admin، /branch) لها رأسُها و«‹ الرئيسية» الداخليّ، والمالكُ
 *  يُحوَّل من الرئيسية إلى لوحته — فزرٌّ يعيده إليها يدور. */
const HIDDEN = /^\/(owner|admin|branch)(\/|$)/;

export function BackBar() {
  const pathname = usePathname();
  const native = useNativeApp();
  if (!pathname || pathname === '/' || HIDDEN.test(pathname)) return null;

  function back(e: React.MouseEvent<HTMLAnchorElement>) {
    // في التطبيق كلُّ التاريخ لنا؛ وفي المتصفّح الإحالةُ من موقعنا هي الدليل.
    // ponytail: بعد router.push (الخريطة ← محطة) تضيع الإحالةُ في المتصفّح
    // فتُفتح الرئيسيةُ كاملةً بدل الرجوع إليها — الوجهةُ نفسُها؛ يكفي.
    const ours = native || document.referrer.startsWith(`${location.origin}/`);
    if (history.length > 1 && ours) {
      e.preventDefault();
      history.back();
    }
  }

  return (
    <nav className="mx-auto flex max-w-md px-4 pt-3">
      <a href="/" onClick={back} className="btn-ghost px-4">
        <span aria-hidden className="text-xl leading-none">‹</span>
        رجوع
      </a>
    </nav>
  );
}
