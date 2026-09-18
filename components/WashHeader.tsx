'use client';
import { WashUIIcon as Icon } from './WashUIIcon';

/** رأسُ «المغسلة التقنية»: تطبيقٌ مصغّرٌ منفصلٌ عن الوقود بهويّة المحطة الخضراء — وزرُّ عودةٍ
 *  صريحٌ إلى المنصّة الأمّ (BackBar العامّ يمتنع في /wash/ لهذا السبب). */
export function WashHeader({ city, onCity, onFavorites, favorites }: { city: string; onCity: () => void; onFavorites: () => void; favorites: boolean }) {
  return (
    <header className="wash-topbar">
      <a className="wash-back" href="/" aria-label="العودة إلى المحطة التقنية">
        <span aria-hidden>‹</span>
        <em style={{ fontStyle: 'normal' }}>العودة إلى </em>المحطة التقنية
      </a>
      <a className="wash-brand" href="/wash/">
        <span className="wash-brand-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wash/mark.png" alt="" />
        </span>
        <span>
          <strong>المغسلة التقنية</strong>
          <small>من المحطة التقنية · الأنبار</small>
        </span>
      </a>
      <nav className="wash-desktop-nav" aria-label="التنقل الرئيسي">
        <a href="#discover" className={!favorites ? 'active' : ''}>اكتشف المغاسل</a>
        <a href="/wash/mine/">حجوزاتي</a>
        <button onClick={onFavorites} className={favorites ? 'active' : ''}>المفضلة</button>
      </nav>
      <div className="wash-header-actions">
        <button className="wash-city" onClick={onCity}>
          <Icon name="pin" />
          <span><small>العراق › الأنبار</small><b>{city || 'كل مدن الأنبار'}</b></span>
          <Icon name="down" size={14} />
        </button>
        <a className="wash-account" href="/wash/mine/" aria-label="حجوزاتي"><Icon name="calendar" /></a>
      </div>
    </header>
  );
}
