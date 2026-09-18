'use client';

import { WASH } from '@/lib/wash';
import { AdminOnly } from './AdminOnly';
import { WashAdminBar } from './WashAdminBar';

/** بوّابةُ «غسيل»: مفتوحٌ للجميع حين `WASH.active`، وقبله للإدارة وحدَها —
 *  كما بدأ «مساعد الطريق». وشريطُ الإدارة فوق كلّ صفحةٍ للمشرف كي يتنقّل بين الأدوار. */
export function WashGate({ children }: { children: React.ReactNode }) {
  const inner = (
    <>
      <WashAdminBar />
      {children}
    </>
  );
  return WASH.active ? inner : <AdminOnly>{inner}</AdminOnly>;
}
