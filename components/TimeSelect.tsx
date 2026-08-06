'use client';

import { timeToMinutes, to24Hour } from '@/lib/hours';

// <input type="time"> renders AM/PM from the browser's own locale, which we
// cannot force to Arabic. Three selects give full control of the wording.
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ['00', '15', '30', '45'];

export function TimeSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string; // "HH:MM" or "HH:MM:SS"
  onChange: (next: string) => void;
}) {
  const total = timeToMinutes(value);
  const h24 = Math.floor(total / 60);
  const minute = String(total % 60).padStart(2, '0');
  const isMorning = h24 < 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const emit = (nextH12: number, nextMinute: string, morning: boolean) =>
    onChange(to24Hour(nextH12, nextMinute, morning));

  return (
    <div>
      <span className="label">{label}</span>
      {/* RTL order: صباحاً/مساءً on the right, then minutes, hour on the left */}
      <div className="grid grid-cols-3 gap-1.5">
        <select
          aria-label={`${label} — صباحاً أو مساءً`}
          value={isMorning ? 'am' : 'pm'}
          onChange={(e) => emit(h12, minute, e.target.value === 'am')}
          className="field px-1 text-center"
        >
          <option value="am">صباحاً</option>
          <option value="pm">مساءً</option>
        </select>
        <select
          aria-label={`${label} — الدقيقة`}
          value={minute}
          onChange={(e) => emit(h12, e.target.value, isMorning)}
          className="field px-1 text-center"
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          id={id}
          aria-label={`${label} — الساعة`}
          value={h12}
          onChange={(e) => emit(Number(e.target.value), minute, isMorning)}
          className="field px-1 text-center"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

      </div>
    </div>
  );
}
