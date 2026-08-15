// Lucide paths, inlined — one icon family, 1.75 stroke, no emoji, no dependency.
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
