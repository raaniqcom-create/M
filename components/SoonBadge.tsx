// Blinking "قريباً" in the site's own green and font — the launch is near but
// station registration is already open.
export function SoonBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-extrabold text-brand-700 ${className}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 animate-blink rounded-full bg-brand" />
      <span className="animate-blink">قريباً</span>
    </span>
  );
}
