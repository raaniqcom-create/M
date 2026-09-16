'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { iqd, type WashFeatures, type WashPlan } from '@/lib/wash';
import { SpinnerIcon } from './icons';

/** مفاتيحُ app_config ببادئة wash_ كما تراها الإدارة — قيمُها أرقامٌ أو true/false. */
const KEYS: { key: string; label: string; hint: string; bool?: boolean }[] = [
  { key: 'wash_promo_first_month', label: 'عرض الإطلاق — أوّل شهر (دينار)', hint: '٠ يوقف العرض' },
  { key: 'wash_trial_days', label: 'أيّام التجربة المجّانيّة', hint: '٠ يوقف التجربة' },
  { key: 'wash_grace_days', label: 'فترة السماح بعد الانتهاء (أيّام)', hint: 'الصفحة والحجز يبقيان خلالها' },
  { key: 'wash_cancel_free_min', label: 'إلغاء مجّانيّ قبل الموعد بـ(دقيقة)', hint: 'بعدها يُحسب إلغاءً متأخّراً' },
  { key: 'wash_no_show_block', label: 'غيابات تحدّ الحجز', hint: 'بعدها الحجز لليوم فقط' },
  { key: 'wash_no_show_window_days', label: 'نافذة عدّ الغيابات (أيّام)', hint: '' },
  { key: 'wash_horizon_guest', label: 'أيّام الحجز المسبق لغير المشترك', hint: '١ = اليوم والغد' },
  { key: 'wash_horizon_sub', label: 'أيّام الحجز المسبق للمشترك', hint: '' },
  { key: 'wash_max_active_guest', label: 'حجوز نشطة لغير المشترك', hint: '' },
  { key: 'wash_max_active_sub', label: 'حجوز نشطة للمشترك', hint: '' },
  { key: 'wash_device_daily', label: 'حجوز الجهاز الواحد يوميّاً', hint: '' },
  { key: 'wash_pending_expire_min', label: 'انتهاء الحجز المعلّق بعد موعده بـ(دقيقة)', hint: '' },
  { key: 'wash_reminder_min', label: 'التذكير قبل الموعد بـ(دقيقة)', hint: '' },
  { key: 'wash_push_daily_cap', label: 'سقف إشعارات المغسلة يوميّاً', hint: '' },
  { key: 'wash_sms_month_cap', label: 'سقف SMS شهريّاً للمنصّة', hint: '' },
  { key: 'wash_sms_enabled', label: 'SMS مفعّلة', hint: 'بعد تسجيل اسم المرسِل', bool: true },
  { key: 'wash_otp_required', label: 'OTP للمواطن عند الحجز', hint: 'يحتاج تنفيذ M10', bool: true },
];

const NUM_FEATURES: { key: keyof WashFeatures; label: string }[] = [
  { key: 'booking_monthly_limit', label: 'حجوز شهريّاً (٠ = بلا حدّ)' },
  { key: 'gallery_limit', label: 'صور المعرض' },
  { key: 'staff_limit', label: 'الموظّفون' },
  { key: 'sms_monthly_limit', label: 'SMS شهريّاً' },
];
const BOOL_FEATURES: { key: keyof WashFeatures; label: string }[] = [
  { key: 'offers_enabled', label: 'العروض' },
  { key: 'featured', label: 'ظهور مميّز' },
  { key: 'analytics', label: 'إحصائيّات متقدّمة' },
];

interface AdminConfig {
  config: Record<string, string>;
  plans: WashPlan[];
}

/** الباقاتُ والإعداداتُ العامّة لقسم المغاسل — تُعدَّل هنا وتسري بلا نشر. */
export function WashPlansAdmin() {
  const [data, setData] = useState<AdminConfig | null>(null);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<WashPlan[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('wash_admin_config');
    if (error) return setNote(error.message);
    const d = data as AdminConfig;
    setData(d);
    setCfg(d.config ?? {});
    setPlans(d.plans ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveKey(key: string) {
    const value = (cfg[key] ?? '').trim();
    if (!/^[a-z0-9]{1,20}$/.test(value)) return setNote(`قيمة ${key} غير صالحة — رقمٌ أو true/false.`);
    setBusy(key);
    const { error } = await supabase.rpc('set_wash_config', { p_key: key, p_value: value });
    setBusy(null);
    if (error) return setNote(error.message);
    setNote(null);
    setData((d) => (d ? { ...d, config: { ...d.config, [key]: value } } : d));
  }

  async function savePlan(p: WashPlan) {
    setBusy(p.code);
    const { error } = await supabase.rpc('admin_set_wash_plan', {
      p_code: p.code,
      p_name: p.name,
      p_price: p.price_iqd,
      p_features: p.features,
      p_public: p.public ?? true,
      p_active: p.active ?? true,
      p_sort: p.sort ?? 0,
    });
    setBusy(null);
    if (error) return setNote(error.message);
    setNote(null);
    void load();
  }

  function patchPlan(code: string, patch: Partial<WashPlan>) {
    setPlans((ps) => ps.map((p) => (p.code === code ? { ...p, ...patch } : p)));
  }
  function patchFeature(code: string, key: keyof WashFeatures, value: number | boolean) {
    setPlans((ps) => ps.map((p) => (p.code === code ? { ...p, features: { ...p.features, [key]: value } } : p)));
  }

  if (!data) {
    return (
      <div className="flex justify-center p-6">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {note && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-traffic-red">
          {note}
        </p>
      )}

      <section>
        <h3 className="text-sm font-bold">الباقات</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">الأسعارُ والحدودُ تسري فوراً على التسجيل واللوحات — بلا نشر.</p>
        <div className="mt-2 space-y-3">
          {plans.map((p) => (
            <article key={p.code} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-slate-400" dir="ltr">
                  {p.code}
                </p>
                <div className="flex gap-3 text-[11px]">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={p.public ?? true} onChange={(e) => patchPlan(p.code, { public: e.target.checked })} className="accent-brand" />
                    تُعرض للتسجيل
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={p.active ?? true} onChange={(e) => patchPlan(p.code, { active: e.target.checked })} className="accent-brand" />
                    فعّالة
                  </label>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`pn-${p.code}`} className="label text-[11px]">الاسم</label>
                  <input id={`pn-${p.code}`} value={p.name} onChange={(e) => patchPlan(p.code, { name: e.target.value })} className="field py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor={`pp-${p.code}`} className="label text-[11px]">السعر الشهريّ (دينار)</label>
                  <input
                    id={`pp-${p.code}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    value={p.price_iqd}
                    onChange={(e) => patchPlan(p.code, { price_iqd: Math.max(0, Number(e.target.value) || 0) })}
                    className="field py-2 text-sm"
                    dir="ltr"
                  />
                </div>
                {NUM_FEATURES.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`pf-${p.code}-${f.key}`} className="label text-[11px]">{f.label}</label>
                    <input
                      id={`pf-${p.code}-${f.key}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={Number(p.features?.[f.key] ?? 0)}
                      onChange={(e) => patchFeature(p.code, f.key, Math.max(0, Number(e.target.value) || 0))}
                      className="field py-2 text-sm"
                      dir="ltr"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
                {BOOL_FEATURES.map((f) => (
                  <label key={f.key} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!p.features?.[f.key]}
                      onChange={(e) => patchFeature(p.code, f.key, e.target.checked)}
                      className="accent-brand"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              <button type="button" disabled={busy === p.code} onClick={() => savePlan(p)} className="btn-primary mt-3 w-full text-xs">
                {busy === p.code && <SpinnerIcon className="h-4 w-4" />}
                حفظ «{p.name}» — {iqd(p.price_iqd)}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold">الإعدادات</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {KEYS.map((k) => {
            const v = cfg[k.key] ?? '';
            const changed = v !== (data.config[k.key] ?? '');
            return (
              <li key={k.key} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`k-${k.key}`} className="block text-[12px] font-semibold text-slate-700">
                    {k.label}
                  </label>
                  {k.hint && <p className="text-[10.5px] text-slate-400">{k.hint}</p>}
                </div>
                {k.bool ? (
                  <select id={`k-${k.key}`} value={v || 'false'} onChange={(e) => setCfg((c) => ({ ...c, [k.key]: e.target.value }))} className="field w-24 py-1.5 text-sm">
                    <option value="true">نعم</option>
                    <option value="false">لا</option>
                  </select>
                ) : (
                  <input
                    id={`k-${k.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={v}
                    onChange={(e) => setCfg((c) => ({ ...c, [k.key]: e.target.value.replace(/\D/g, '') }))}
                    className="field w-24 py-1.5 text-sm"
                    dir="ltr"
                  />
                )}
                <button
                  type="button"
                  disabled={!changed || busy === k.key}
                  onClick={() => saveKey(k.key)}
                  className={`min-h-[36px] rounded-lg px-3 text-[11px] font-bold ${changed ? 'bg-brand text-white' : 'bg-slate-100 text-slate-400'}`}
                >
                  حفظ
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
