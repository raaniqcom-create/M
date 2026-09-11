'use client';

import type { ComponentType } from 'react';
import {
  AlertTriangleIcon,
  CarIcon,
  EyeIcon,
  ImageIcon,
  LockIcon,
  MessageIcon,
  StoreIcon,
  UserIcon,
} from './icons';

export type OwnerView = 'home' | 'chat' | 'info' | 'designs' | 'complaints' | 'traffic' | 'account';

/** شاشةُ الهاتف: أيقونةٌ فوق اسم، ثمانيةٌ في صفّين.
 *
 *  كانت اللوحةُ أربعةَ تبويباتٍ نصّيّة يسبقها ستُّ بطاقات، فلا يصل صاحبُ
 *  المحطة إلى منتجاته إلّا بالتمرير. والطلبُ صريح: «تفتح مباشرةً على شاشة
 *  المنتجات، وباقي الخيارات أزرارٌ كأيقونات موبايل». فالشبكةُ صفّان لا أكثر،
 *  والمنتجاتُ تحتها بلا فاصل.
 *
 *  و«إغلاق مؤقت» فعلٌ لا شاشة — ينقلب في مكانه — لأنّ الحادثَ لا ينتظر
 *  شاشةً ثانية. و«شاهد كمواطن» رابطٌ لا زرّ: يخرج من اللوحة إلى الرئيسة
 *  بـ`?view=user`، وهو المِفتاحُ الذي يمنع التحويلَ إلى اللوحة من جديد. */
export function OwnerHomeIcons({
  unread,
  complaints,
  tempClosed,
  onOpen,
  onTempClose,
}: {
  unread: number;
  complaints: number;
  tempClosed: boolean;
  onOpen: (view: Exclude<OwnerView, 'home'>) => void;
  onTempClose: () => void;
}) {
  const items: {
    key: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    badge?: number;
    tone?: 'red' | 'brand';
    onClick?: () => void;
    href?: string;
  }[] = [
    { key: 'chat', label: 'الرسائل', icon: MessageIcon, badge: unread, onClick: () => onOpen('chat') },
    { key: 'info', label: 'معلومات المحطة', icon: StoreIcon, onClick: () => onOpen('info') },
    { key: 'designs', label: 'التصاميم', icon: ImageIcon, onClick: () => onOpen('designs') },
    {
      key: 'complaints',
      label: 'الشكاوي',
      icon: AlertTriangleIcon,
      badge: complaints,
      onClick: () => onOpen('complaints'),
    },
    { key: 'traffic', label: 'الازدحام', icon: CarIcon, onClick: () => onOpen('traffic') },
    {
      key: 'close',
      label: tempClosed ? 'إعادة الفتح' : 'إغلاق مؤقت',
      icon: LockIcon,
      tone: tempClosed ? 'red' : undefined,
      onClick: onTempClose,
    },
    { key: 'account', label: 'حسابي', icon: UserIcon, onClick: () => onOpen('account') },
    { key: 'citizen', label: 'شاهد كمواطن', icon: EyeIcon, href: '/?view=user' },
  ];

  return (
    <nav aria-label="أقسام اللوحة" className="grid grid-cols-4 gap-2">
      {items.map(({ key, label, icon: Icon, badge, tone, onClick, href }) => {
        const cls = `relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[11px] font-bold leading-tight ${
          tone === 'red' ? 'bg-red-50 text-traffic-red' : 'bg-brand-50 text-brand-800'
        }`;
        const body = (
          <>
            <Icon className="h-6 w-6" />
            {label}
            {/* رقمٌ لا نقطة: «٣ شكاوٍ» تُقرأ قبل الضغط، والنقطةُ تُضغط لتُعرف. */}
            {!!badge && (
              <span
                aria-label={`${badge} غير مقروء`}
                className="absolute end-1.5 top-1.5 min-w-[18px] rounded-full bg-traffic-red px-1 text-[10px] font-extrabold leading-[18px] text-white"
              >
                {badge}
              </span>
            )}
          </>
        );
        return href ? (
          <a key={key} href={href} className={cls}>
            {body}
          </a>
        ) : (
          <button key={key} type="button" onClick={onClick} className={cls}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
