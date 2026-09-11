'use client';

import { IconGrid } from './IconGrid';
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

/** أيقوناتُ لوحة المالك — ثمانيةٌ في صفّين.
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
  return (
    <IconGrid
      label="أقسام اللوحة"
      items={[
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
      ]}
    />
  );
}
