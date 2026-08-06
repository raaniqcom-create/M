import type { StationKind } from '@/types/database';

export const KIND_LABELS: Record<StationKind, string> = {
  private: 'أهلية',
  government: 'حكومية',
};

export const KIND_STYLES: Record<StationKind, string> = {
  private: 'bg-amber-50 text-amber-700',
  government: 'bg-blue-50 text-blue-700',
};

export const KINDS: StationKind[] = ['government', 'private'];
