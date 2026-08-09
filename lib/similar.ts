import type { Station } from '@/types/database';

// Words that appear on half the forecourts in Anbar and tell you nothing about
// which one you are looking at.
const NOISE = [
  'محطة', 'محطه', 'وقود', 'تعبئة', 'تعبئه', 'النموذجية', 'النموذجيه',
  'المشيدة', 'المشيده', 'للوقود', 'ال',
];

/** Arabic writes the same name several ways — أ/إ/آ for alif, ة/ه at the end,
 *  optional diacritics. Comparing raw strings would call two spellings of one
 *  station different, which is exactly the case we are trying to catch. */
export function normalise(name: string): string[] {
  const flat = name
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^؀-ۿ0-9\s]/g, ' ');
  return flat
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !NOISE.includes(w));
}

const core = (p: string) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^00/, '');
  return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '');
};

/** Existing stations a pending request might be a duplicate of. Deliberately
 *  advisory: it flags candidates for a human to judge, and never acts. */
export function findSimilar(request: Station, existing: Station[]): Station[] {
  const words = new Set(normalise(request.name));
  const phone = core(request.phone);

  return existing.filter((s) => {
    if (s.id === request.id) return false;
    if (core(s.phone) === phone) return true;
    if (s.city !== request.city) return false;
    return normalise(s.name).some((w) => words.has(w));
  });
}
