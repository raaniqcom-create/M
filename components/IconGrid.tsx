'use client';

import type { ComponentType } from 'react';

export type IconGridItem = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** رقمٌ أحمر في الزاوية — يُقرأ قبل الضغط. */
  badge?: number;
  tone?: 'red' | 'brand';
  active?: boolean;
  onClick?: () => void;
  href?: string;
};

/** شاشةُ الهاتف: أيقونةٌ فوق اسم، أربعٌ في الصفّ.
 *
 *  بُنيت للوحة المالك ثمّ طلبها صاحبُ المنصّة للوحة الإدارة — فالشكلُ واحد
 *  والبنودُ هي ما يختلف. رابطٌ حين `href`، وزرٌّ فيما سواه. */
export function IconGrid({ items, label }: { items: IconGridItem[]; label: string }) {
  return (
    <nav aria-label={label} className="grid grid-cols-4 gap-2">
      {items.map(({ key, label: text, icon: Icon, badge, tone, active, onClick, href }) => {
        const cls = `relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[11px] font-bold leading-tight ${
          tone === 'red'
            ? 'bg-red-50 text-traffic-red'
            : active
              ? 'bg-brand text-white'
              : 'bg-brand-50 text-brand-800'
        }`;
        const body = (
          <>
            <Icon className="h-6 w-6" />
            {text}
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
          <button key={key} type="button" onClick={onClick} aria-pressed={active} className={cls}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
