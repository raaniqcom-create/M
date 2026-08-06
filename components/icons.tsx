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
