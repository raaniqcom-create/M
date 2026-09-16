'use client';

import { WASH } from '@/lib/wash';
import { AdminOnly } from './AdminOnly';

/** بوّابةُ «غسيل»: مفتوحٌ للجميع حين `WASH.active`، وقبله للإدارة وحدَها —
 *  كما بدأ «مساعد الطريق». */
export function WashGate({ children }: { children: React.ReactNode }) {
  return WASH.active ? <>{children}</> : <AdminOnly>{children}</AdminOnly>;
}
