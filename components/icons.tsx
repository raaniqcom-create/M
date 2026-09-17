// Lucide paths, inlined — one icon family, 1.75 stroke, no emoji, no dependency.
import type { ReactElement } from 'react';
import type { ServiceIconKey } from '@/lib/wash';

type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const BellIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </svg>
);

export const BellRingIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M22 8c0-2.3-.8-4.3-2-6" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    <path d="M4 2C2.8 3.7 2 5.7 2 8" />
  </svg>
);

export const PhoneIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </svg>
);

export const MapPinIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const ShareIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 2v13" />
    <path d="m16 6-4-4-4 4" />
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
  </svg>
);

export const CheckIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const XIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const FuelIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <line x1="3" x2="15" y1="22" y2="22" />
    <line x1="4" x2="14" y1="9" y2="9" />
    <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
    <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
  </svg>
);

export const LogOutIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  </svg>
);

export const SpinnerIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={`${className} animate-spin`}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const SearchIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </svg>
);

export const ListIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13" />
  </svg>
);

export const StarIcon = ({ className = 'h-5 w-5', filled = false }: IconProps & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />
  </svg>
);

export const SlidersIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10 5H3M21 5h-7M6 5v14M18 12v7M18 5v3M14 12H3M21 12h-3M14 19H3M21 19h-3M6 19v-3" />
  </svg>
);

export const EyeIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </svg>
);

export const UserIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const StoreIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const ShieldIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

export const PlusIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export const DownloadIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export const MessageIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
  </svg>
);

export const VolumeIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path d="M16 9a5 5 0 0 1 0 6" />
    <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </svg>
);

export const InfoIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

/** رمزُ Face ID كما يعرفه أصحابُ الآيفون: إطارٌ بزواياه الأربع، عينان وأنفٌ وفم. */
export const FaceIdIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7 3H5a2 2 0 0 0-2 2v2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M17 21h2a2 2 0 0 0 2-2v-2" />
    <path d="M8 9.5v1" />
    <path d="M16 9.5v1" />
    <path d="M12 9.5v4a1 1 0 0 1-1 1" />
    <path d="M9 16.5a4.2 4.2 0 0 0 6 0" />
  </svg>
);

/** رمزُ بصمة الإصبع (Lucide fingerprint) — أندرويد وآيفون القديم. */
export const FingerprintIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </svg>
);

export const LockIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const ExternalLinkIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

export const WhatsappIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9z" />
    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
  </svg>
);

export const FacebookIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export const InstagramIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37" />
    <path d="M17.5 6.5h.01" />
  </svg>
);

export const AppleIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06" />
    <path d="M10 2c1 .5 2 2 2 5" />
  </svg>
);

export const AndroidIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 16V9a7 7 0 0 1 14 0v7" />
    <path d="M4 16h16a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1" />
    <path d="m7 4 1.5 2.5M17 4l-1.5 2.5" />
    <path d="M9 11h.01M15 11h.01" />
  </svg>
);

// سهمٌ لأسفل: شريط النطاق يقول إنه يُفتح، ولا شيء غيره في الملف يقولها.
export const ChevronDownIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// مركزُ تصويب: «أقرب محطة إليّ» في الشريط السفلي. ودبّوس الخريطة لا يصلح
// له — الشريط يحمل الاثنين متجاورين، فيصيران زرّين بأيقونةٍ واحدة.
export const CrosshairIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

// خريطةٌ مطويّة: أوضح من دبّوسٍ ثانٍ بجوار «أقرب محطة».
export const CalendarIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const MapIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);

export const ImageIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </svg>
);

export const AlertTriangleIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const ChartIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M7 16v-5M12 16V8M17 16v-3" />
  </svg>
);

export const MegaphoneIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);

export const CarIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <path d="M9 17h6" />
    <circle cx="17" cy="17" r="2" />
  </svg>
);

export const CanIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M7 3h6v3H7z" />
    <path d="M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
    <path d="M4 10h5l2-2 2 2h7" />
    <path d="M15 3h3l2 2" />
  </svg>
);

/** سيّارةٌ تحت قطراتِ ماء — بديلُ الصورة في بطاقات المغاسل. */
export const WashIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M5 17H3.5a1 1 0 0 1-1-1v-2.5c0-.5.2-1 .5-1.3L5 10h12l2 2.2c.3.3.5.8.5 1.3V16a1 1 0 0 1-1 1H17" />
    <circle cx="7.5" cy="17" r="1.8" />
    <circle cx="16.5" cy="17" r="1.8" />
    <path d="M9.3 17h5.4" />
    <path d="M7 10l1.2-3h7.6L17 10" />
    <path d="M6 2.5c-.6.9-1 1.6-1 2.2a1 1 0 0 0 2 0c0-.6-.4-1.3-1-2.2z" />
    <path d="M12 1.8c-.6.9-1 1.6-1 2.2a1 1 0 0 0 2 0c0-.6-.4-1.3-1-2.2z" />
    <path d="M18 2.5c-.6.9-1 1.6-1 2.2a1 1 0 0 0 2 0c0-.6-.4-1.3-1-2.2z" />
  </svg>
);

/** قلبٌ — المفضّلة؛ `filled` حين تكون مختارة. */
export const HeartIcon = ({ className = 'h-5 w-5', filled = false }: IconProps & { filled?: boolean }) => (
  <svg className={className} {...base} fill={filled ? 'currentColor' : 'none'}>
    <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
  </svg>
);

export const ClockIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const ChevronLeftIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="m15 6-6 6 6 6" />
  </svg>
);

export const TagIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2c.5 0 1 .2 1.4.6z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

export const NavigationIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="m3 11 19-9-9 19-2-8z" />
  </svg>
);

/* أنواعُ السيارات أيقوناتٍ لا أسماءً — التسمياتُ تختلف بين الناس (صالون/سيدان…). */
export const SedanIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M3 13l2-5c.3-.8 1-1.3 1.9-1.3h10.2c.9 0 1.6.5 1.9 1.3l2 5" />
    <path d="M2.5 13h19a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H21" />
    <path d="M3 18H2.5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1" />
    <path d="M6 18h12" />
    <path d="M6.5 7.5 5 13m12.5-5.5L19 13" />
    <circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" />
  </svg>
);
export const SuvIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M3 8h13l3.2 3.5c.5.1 1 .3 1.4.6.5.4.9 1 .9 1.7V16a1 1 0 0 1-1 1h-1" />
    <path d="M4 17H3a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2" />
    <path d="M6 17h12" />
    <path d="M9 8V5.5h5.5L17 8" /><path d="M9 8V5.5H6.5A2.5 2.5 0 0 0 4 8" />
    <path d="M9 5.5V8" />
    <circle cx="7" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" />
  </svg>
);
export const PickupIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M2 15V9a1 1 0 0 1 1-1h9v7" />
    <path d="M12 10h4l3 3h1.5a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H20" />
    <path d="M4 16H3a1 1 0 0 1-1-1" /><path d="M6 16h9" />
    <circle cx="7" cy="16" r="1.8" /><circle cx="17" cy="16" r="1.8" />
  </svg>
);
export const VanIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M2 16V8a2 2 0 0 1 2-2h9.5c.6 0 1.2.3 1.6.8L20 13v3a1 1 0 0 1-1 1h-1" />
    <path d="M4 17H3a1 1 0 0 1-1-1" /><path d="M6 17h9" />
    <path d="M13 6.5V13h6" /><path d="M8 6.5V13" />
    <circle cx="7" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" />
  </svg>
);
export const VehicleIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M5 17H3.5a1 1 0 0 1-1-1v-3l1.6-4c.3-.7 1-1.2 1.8-1.2h10.2c.8 0 1.5.5 1.8 1.2l1.6 4v3a1 1 0 0 1-1 1H19" />
    <path d="M7 17h10" />
    <circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" />
  </svg>
);

/* ── أيقوناتُ الخدمات — بلاطةٌ لكلّ خدمةٍ في صفحة المغسلة ─────────────────── */

/** نجمةُ لمعانٍ بحجمٍ ثابت، تُوضع بـtransform — تتكرّر في «شامل» و«داخلي». */
const SPARK = 'M0-2q.4 1.6 2 2-1.6.4-2 2-.4-1.6-2-2 1.6-.4 2-2z';

/** هيكلُ سيّارةٍ مصغَّرٌ يترك يمينَ المربّع للرغوة/اللمعان — يُكتب مرّةً لخدمتين. */
const CarBody = () => (
  <>
    <path d="M4 17H2.8a.9.9 0 0 1-.9-.9v-2.5l1.4-3.4c.3-.6.8-1 1.5-1h8.1c.7 0 1.2.4 1.5 1l1.4 3.4v2.5a.9.9 0 0 1-.9.9h-1.2" />
    <path d="M7.1 17h3.8" />
    <circle cx="5.5" cy="17" r="1.6" /><circle cx="12.5" cy="17" r="1.6" />
  </>
);

/** غسيلٌ خارجيّ: سيّارةٌ وقوسا رغوةٍ من الخرطوم. */
export const ExteriorWashIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <CarBody />
    <path d="M16.6 9.8c.5-3 2.6-5.2 5.4-5.9" />
    <path d="M18.2 13.7c.3-2 1.6-3.4 3.5-3.9" />
  </svg>
);

/** غسيلٌ شامل: سيّارةٌ بلمعانٍ داخلها وخارجها. */
export const FullWashIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <CarBody />
    <path d={SPARK} transform="translate(9 13)" />
    <path d={SPARK} transform="translate(19.5 5)" />
  </svg>
);

/** تنظيفٌ داخليّ: مقعدُ سيّارةٍ ولمعان. */
export const InteriorIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M8.5 14V6a3 3 0 0 1 3-3h.3a3 3 0 0 1 3 3v8" />
    <path d="M11.6 5.5V14" />
    <path d="M7.5 14h9a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3z" />
    <path d={SPARK} transform="translate(19.8 4)" />
    <path d={SPARK} transform="translate(4.6 7.5)" />
  </svg>
);

/** تلميع: قرصُ ماكينة التلميع وخطوطُ اللمعان. */
export const PolishIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <circle cx="10.5" cy="14.5" r="6" />
    <circle cx="10.5" cy="14.5" r="2.2" />
    <path d="M10.5 8.5V6a2 2 0 0 1 2-2H14" />
    <path d="M17.5 5h4M18.5 8.5l2.8-1M18 1.6l2.4 1.4" />
  </svg>
);

/** شمعٌ/نانو: بخّاخٌ وقطرات. */
export const WaxIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M11 9h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
    <path d="M11 9V6h4v3" />
    <path d="M11 7H7.5L6 5.5" />
    <path d="M9 13h8" />
    <path d="M4.4 2.6c-.6.9-1 1.6-1 2.2a1 1 0 0 0 2 0c0-.6-.4-1.3-1-2.2z" />
    <path d="M2.8 7.4c-.6.9-1 1.6-1 2.2a1 1 0 0 0 2 0c0-.6-.4-1.3-1-2.2z" />
  </svg>
);

/** مقاعدُ وفرش: كنبةٌ وفرشاةُ تنظيف. */
export const SeatsIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} {...base}>
    <path d="M14.5 10.5V8A1.5 1.5 0 0 0 13 6.5H4A1.5 1.5 0 0 0 2.5 8v2.5" />
    <path d="M1.5 12v4a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-4a1.5 1.5 0 0 0-3 0v1.5h-8V12a1.5 1.5 0 0 0-3 0z" />
    <path d="M4 17.5v2M13 17.5v2" />
    <path d="M18.5 2.5h3a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
    <path d="M18.3 7v2M20 7v2.5M21.7 7v2" />
  </svg>
);

/** مفاتيحُ serviceIconKey() — «أخرى» ترثُ أيقونةَ الغسيل العامّة. */
export const SERVICE_ICON: Record<ServiceIconKey, (p: { className?: string }) => ReactElement> = {
  exterior: ExteriorWashIcon,
  full: FullWashIcon,
  interior: InteriorIcon,
  polish: PolishIcon,
  wax: WaxIcon,
  seats: SeatsIcon,
  other: WashIcon,
};
