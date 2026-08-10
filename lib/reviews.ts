import { supabase } from './supabase';

/** Public display of ratings. OFF until the admin queue has been used in
 *  anger and the App Store review of 1.5.0 has landed: the iOS shell loads the
 *  live site, so anything visible here is visible to the reviewer, and we
 *  declared that the app carries no user-generated content.
 *
 *  Flip to true to publish. Nothing else has to change. */
export const REVIEWS_PUBLIC = false;

export interface StationReview {
  id: string;
  station_id: string;
  rating: number;
  comment: string | null;
  device_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const KEY = 'device-id';

/** Drivers have no accounts, so a browser-scoped id is the only handle we have.
 *  ponytail: clearing site data buys another vote — the unique constraint
 *  raises the cost of spam without pretending to end it. Move to a signed
 *  server-side token if a station is ever actually brigaded. */
export function deviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Returns an Arabic error, or null when the review was stored as pending. */
export async function submitReview(
  stationId: string,
  rating: number,
  comment: string
): Promise<string | null> {
  const { error } = await supabase.from('station_reviews').insert({
    station_id: stationId,
    rating,
    comment: comment.trim() || null,
    device_id: deviceId(),
  });

  if (!error) return null;
  // 23505 is the unique (station_id, device_id) constraint
  if (error.code === '23505') return 'سبق أن قيّمت هذه المحطة';
  return 'تعذّر إرسال التقييم، حاول لاحقاً';
}
