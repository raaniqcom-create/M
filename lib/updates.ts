import { PRODUCT_LABELS, TRAFFIC_LABELS } from './products.ts';
import { PERIOD_LABELS, type ExpectedPeriod } from './hours.ts';
import type { FuelProduct, TrafficLevel } from '../types/database.ts';

/** سجلُّ التحديثات — صفُّ `station_updates` كما يُقرأ. */
export interface UpdateRow {
  id: number;
  product: FuelProduct | null;
  change: Record<string, unknown>;
  actor: string | null;
  created_at: string;
}

export interface ManagerRow {
  user_id: string;
  phone: string | null;
  username: string | null;
  label: string | null;
  active: boolean;
}

/** ما يُعرض ويُدخل به: الرقمُ أو اسمُ الدخول. */
export const loginOf = (m: { phone: string | null; username: string | null }): string =>
  m.phone ?? m.username ?? '';

/** من فعل: الأساسيُّ برقم المحطة، الورديةُ بوصفها ورقمها، الإدارةُ، أو النظامُ (كرون). */
export function actorName(
  actor: string | null,
  ownerId: string | null,
  stationPhone: string,
  managers: ManagerRow[]
): string {
  if (!actor) return 'النظام';
  if (ownerId && actor === ownerId) return `الأساسي ${stationPhone}`;
  const m = managers.find((x) => x.user_id === actor);
  if (m) return `${m.label ?? 'موظّف'} ${loginOf(m)}`;
  return 'الإدارة';
}

const hm = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' });
};

/** «بانزين عادي → متوفّر» — جملةٌ واحدة لكلّ مفتاحٍ تغيّر. */
export function describeChange(product: FuelProduct | null, change: Record<string, unknown>): string {
  const p = product ? PRODUCT_LABELS[product] : '';
  const out: string[] = [];
  if ('confirm' in change) out.push('أكّد التوفّر');
  if ('is_available' in change) out.push(`${p} → ${change.is_available ? 'متوفّر' : 'غير متوفّر'}`);
  if ('runs_out_at' in change) {
    out.push(change.runs_out_at ? `${p}: ينفد ${hm(change.runs_out_at)}` : `${p}: أُلغي موعد النفاد`);
  }
  if ('traffic_level' in change) {
    const v = change.traffic_level as TrafficLevel | null;
    out.push(v ? `${p}: الازدحام ${TRAFFIC_LABELS[v]}` : `${p}: مُسح الازدحام`);
  }
  if ('expected_at' in change || 'expected_period' in change || 'expected_time' in change) {
    const at = change.expected_at as string | null | undefined;
    if (at === null) out.push(`${p}: أُلغي موعد الوصول`);
    else {
      const period = change.expected_period as ExpectedPeriod | null | undefined;
      const time = change.expected_time as string | null | undefined;
      const when = [at, period ? PERIOD_LABELS[period] : null, time].filter(Boolean).join(' ');
      out.push(`${p}: موعد الوصول ${when}`.trim());
    }
  }
  if ('temp_closed' in change) out.push(change.temp_closed ? 'إغلاق مؤقّت' : 'فتحُ المحطة');
  if ('manual_traffic_level' in change) {
    const v = change.manual_traffic_level as TrafficLevel | null;
    out.push(v ? `ازدحام المحطة: ${TRAFFIC_LABELS[v]}` : 'مُسح ازدحام المحطة');
  }
  return out.join(' · ') || 'تحديث';
}
