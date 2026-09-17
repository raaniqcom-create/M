-- ═══ الإعلانُ يفتح المحطة ═══════════════════════════════════════════════════
--
-- «مغلقة مؤقتاً لأنها لم تحدّث حالاتها، فعند التحديث يجب أن يذهب شرط الإيقاف»
-- — صاحبُ المنصّة، ١٧ أيلول.
--
-- والحادثة: محطةُ بوابة الرمادي أُعلن فيها البانزين المحسَّن، فكُتب الصفُّ
-- صحيحاً (is_available = true بختمٍ في الثانية عشرة والنصف) ولم يظهر شيء.
-- السببُ أنّ `station_open_now` تردّ false على المغلقة مؤقتاً
-- (20260819_closed_traffic_and_log.sql:25)، فتسقط `isOffered` (lib/products.ts:249)
-- ويسقط المنتجُ من البطاقة، ومن `station_products_live`، ومن الإشعار معاً.
--
-- والقياسُ يقول إنّها ليست حادثةً واحدة: ثلاثٌ من تسعٍ وأربعين معتمدةً عالقةٌ
-- مغلقةً اليوم، و`station_updates` تشهد أنّ لكلّ قلبةٍ فاعلاً — **لا مُغلِقَ
-- تلقائيّاً في المنصّة**. فالسببُ إصبعٌ ضغطت أيقونةً بين ثمانٍ بلا سؤال، ثمّ لا
-- يجد صاحبُها في تيليجرام وواتساب لافتةً ولا زرَّ فتح، ولا تصله رسائلُ
-- `owner-daily` (كلُّ فروعها تتخطّى `temp_closed`) — فيبقى الشرطُ قائماً أبداً.
--
-- فالإصلاحُ حيث تلتقي المسالكُ الخمسة: صفُّ `station_products`. من قال «متوفّر»
-- قال «أنا مفتوح»، والقاعدةُ تسمعها منه مرّةً واحدةً أيّاً كان بابُه — لوحةً أو
-- إدارةً أو بوتاً — بدل خمسِ رقعٍ في خمسة ملفّاتٍ تُنسى إحداها.
begin;

-- ── ١ · الفتحُ يتبع الإعلان ────────────────────────────────────────────────
create or replace function public.reopen_on_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `and temp_closed` شرطٌ لا زينة: الغالبُ محطةٌ مفتوحةٌ أصلاً، فلا صفَّ يُكتب
  -- ولا يُوقَظ حارسٌ ولا سجلّ. و«أكّد التوفّر» يمرّ على سبعة صفوف: الأوّلُ يفتح،
  -- والستّةُ بعده لا تجد ما تكتبه.
  update stations
     set temp_closed = false
   where id = new.station_id
     and temp_closed;
  return null;
end;
$$;

comment on function public.reopen_on_availability() is
  'إعلانُ توفّرٍ يرفع stations.temp_closed. الإطفاءُ لا يرفعه، والكرونُ لا يرفعه.';

-- الشرطُ في `when` لا في المتن: القاعدةُ تفحصه بلا نداءِ دالّة، فالتسعةُ
-- والتسعون في المئة من التحديثات لا تكلّف شيئاً.
--
-- وشطرُه الثاني — «ولمسها إنسان» — ليس احتياطاً بل هو الحارس: `clear_stale_traffic`
-- (20260911b_product_traffic_and_run_out.sql:38-49) تكتب صفوفاً **متوفّرةً** كلَّ
-- خمس دقائق حين يُقفل الدوامُ أو يشيخ الازدحام. فبشرط «متوفّر» وحدَه يفتح
-- الكرونُ محطةً أغلقها صاحبُها، وبفاعلٍ فارغٍ يقول السجلُّ «النظام · فتحُ
-- المحطة» — ولا يبقى لأحدٍ بابٌ يُغلق به. وهي لا تمسّ `updated_at` ولا
-- `is_available`. و`expire_run_outs` تُطفئ فتسقط بالشطر الأوّل أصلاً.
--
-- والسابقةُ لهذا الشكل في المستودع: `silence_reset` (20260915c_silence_views.sql:77)
-- مُشغّلٌ بعد التحديث على الجدول نفسِه مفتاحُه `updated_at is distinct from`.
--
-- ولا فرعَ INSERT: `ensure_station_products` (20260913c:21-40) تخلق الصفوفَ
-- السبعةَ بـ`is_available = false`، فلا مولودَ متوفّراً.
drop trigger if exists station_products_reopen_trg on public.station_products;
create trigger station_products_reopen_trg
  after update on public.station_products
  for each row
  when (
    new.is_available
    and (old.is_available is distinct from new.is_available
         or old.updated_at   is distinct from new.updated_at)
  )
  execute function public.reopen_on_availability();

-- ── ٢ · العالقاتُ — ما ناقض نفسَه وحدَه ────────────────────────────────────
-- لا «افتح كلَّ مغلقة»: محطةٌ مغلقةٌ لصيانةٍ حقيقيّةٍ تبقى مغلقة، وفتحُها من هنا
-- يبعث سائقاً إلى ساحةٍ موصدة — وهو العطبُ الذي وُجدت المنصّةُ لمنعه.
--
-- بل ما سيمنعه المُشغّلُ من اليوم، مُطبَّقاً على الماضي: محطةٌ مغلقةٌ وفيها
-- منتجٌ معروضٌ متوفّراً خلال ٤٨ ساعة — وهي نافذةُ `station_products_live` نفسُها
-- (20260903_runs_out_at.sql:63). التناقضُ هو الإذن، لا الشفقة.
--
-- ولا يُرسَل بهذا إشعار: `updated_at` لا يُمسّ، ومِكنسةُ `notify-favorites`
-- ترشّح على `updated_at > now() - 10min`.
update stations s
   set temp_closed = false
 where s.temp_closed
   and exists (
     select 1 from station_products sp
      where sp.station_id = s.id
        and sp.is_available
        and sp.updated_at > now() - interval '48 hours'
   );

-- ── ٣ · يسقط الترحيلُ هنا لا الزرُّ غداً ───────────────────────────────────
-- والفحصُ على صفٍّ حيٍّ ثمّ يُرَدّ: `raise` داخل كتلةٍ فرعيّةٍ يُرجع البياناتِ
-- ولا يُرجع متغيّراتِ plpgsql — فتبقى الشهادةُ ويذهب الأثر.
do $$
declare
  probe_station       uuid;
  probe_product       public.fuel_product;
  off_kept_closed     boolean;
  on_reopened         boolean;
  traffic_kept_closed boolean;
begin
  assert exists (
    select 1 from pg_trigger
     where tgrelid = 'public.station_products'::regclass
       and tgname  = 'station_products_reopen_trg'
       and not tgisinternal
  ), 'المُشغّلُ لم يُنشأ';

  select sp.station_id, sp.product into probe_station, probe_product
    from station_products sp order by sp.station_id, sp.product limit 1;
  if probe_station is null then return; end if;   -- قاعدةٌ فارغة

  begin
    update stations set temp_closed = true where id = probe_station;

    -- ١ · الإطفاءُ لا يفتح
    update station_products set is_available = false, updated_at = now()
     where station_id = probe_station and product = probe_product;
    select temp_closed into off_kept_closed from stations where id = probe_station;

    -- ٢ · الإشعالُ يفتح
    update station_products set is_available = true, updated_at = now()
     where station_id = probe_station and product = probe_product;
    select not temp_closed into on_reopened from stations where id = probe_station;

    -- ٣ · الازدحامُ وحدَه لا يفتح — نمطُ `clear_stale_traffic` حرفيّاً: صفٌّ
    --      متوفّرٌ يُكتب بلا مساسٍ بـ`updated_at` ولا بـ`is_available`.
    update stations set temp_closed = true where id = probe_station;
    update station_products set traffic_level = null, traffic_set_at = null
     where station_id = probe_station and product = probe_product;
    select temp_closed into traffic_kept_closed from stations where id = probe_station;

    raise exception 'reopen-probe-rollback';
  exception when others then
    if sqlerrm <> 'reopen-probe-rollback' then raise; end if;
  end;

  assert off_kept_closed,     'الإطفاءُ رفع الإغلاقَ المؤقّت';
  assert on_reopened,         'الإشعالُ لم يرفع الإغلاقَ المؤقّت';
  assert traffic_kept_closed, 'تغييرُ الازدحام وحدَه رفع الإغلاقَ المؤقّت';

  assert not exists (
    select 1 from stations s
     where s.temp_closed
       and exists (select 1 from station_products sp
                    where sp.station_id = s.id and sp.is_available
                      and sp.updated_at > now() - interval '48 hours')
  ), 'بقيت محطةٌ مغلقةٌ ومعروضةٌ معاً';
end $$;

commit;
