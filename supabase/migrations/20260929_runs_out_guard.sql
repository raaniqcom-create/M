-- ═══ صفٌّ حيٌّ لا يحمل موعدَ نفادٍ مضى ══════════════════════════════════════
--
-- «حاولت فتح حالة الوقود لم تتم» — صاحبُ المنصّة، ١٨ أيلول.
--
-- والقياس: الساعةَ 08:25 أشعل «بانزين عادي» في بوابة الرمادي، وعند 08:30
-- أطفأه النظامُ (`actor = null` في station_updates). والسببُ أنّ الصفَّ كان
-- يحمل `runs_out_at = 2026-09-11T05:00` — موعدَ نفادٍ عمرُه أسبوع — فرآه
-- `expire_run_outs` (كلَّ خمس دقائق) «متوفّراً ومضى موعدُ نفاده» فأطفأه.
--
-- ── وهذا مكتوبٌ منذ أيلول، ولم يُحرَس ───────────────────────────────────
--
-- 20260903_runs_out_at.sql:21-28 يقول نصّاً إنّ **كلَّ مسلكٍ يُشعل منتجاً
-- يجب أن يُصفّره**، ويعدّ خمسةً: لوحةُ المالك، ولوحةُ الإدارة، وزرُّ
-- تيليجرام، وزرُّ واتساب، وزرّا «ما زال متوفّراً». وأربعةٌ التزمت، وواحدٌ —
-- `app/admin/station/page.tsx` — يكتب `is_available` و`updated_at` وحدَهما.
-- فبقي شهراً يُولد التفعيلُ منه ميّتاً، ولا أثرَ ظاهرٌ إلّا «لم تتم».
--
-- وقياسُ اليوم: **خمسةٌ وخمسون صفّاً مطفأً** يحمل موعدَ نفادٍ ماضياً. كلُّ
-- واحدٍ منها لغمٌ ينفجر عند أوّل إشعالٍ من تلك الصفحة.
--
-- ── فالحارسُ في القاعدة لا في الصفحات ───────────────────────────────────
--
-- قاعدةٌ واحدةٌ بدل خمسِ رقعٍ تُنسى إحداها: **لا يجتمع «متوفّرٌ» مع موعدِ
-- نفادٍ مضى في صفٍّ يُكتب**. تحرس المسالكَ الخمسة وما يُكتب منها غداً.
--
-- ولا تُصفَّر المواعيدُ المستقبليّة: من قال «ينفد السادسة» وهو متوفّرٌ الآن
-- يبقى قولُه. الشرطُ على الماضي وحدَه.
--
-- ولا حاجةَ إلى تعبئةٍ رجعيّة: الحارسُ يعمل عند الكتابة، والخمسةُ والخمسون
-- تُنزع ألغامُها في اللحظة التي يُشعلها فيها صاحبُها.
begin;

create or replace function public.clear_elapsed_run_out()
returns trigger
language plpgsql
as $$
begin
  if new.is_available and new.runs_out_at is not null and new.runs_out_at <= now() then
    new.runs_out_at := null;
  end if;
  return new;
end;
$$;

comment on function public.clear_elapsed_run_out() is
  'صفٌّ متوفّرٌ لا يحمل موعدَ نفادٍ مضى — وإلّا أطفأه expire_run_outs بعد دقائق.';

-- `before` لا `after`: يُصحَّح الصفُّ قبل أن يُكتب، فلا كتابةَ ثانية ولا صفٌّ
-- في السجلّ عن تصحيحٍ آليّ.
--
-- و`expire_run_outs` لا تتأثّر: هي تكتب `is_available = false`، فالشرطُ
-- أعلاه لا يقع عليها ويبقى `runs_out_at` كما هو — وذاك مقصودٌ في 20260911b:
-- النفادُ قولُ صاحبه يتحقّق، لا لمسةٌ جديدة.
drop trigger if exists station_products_runout_guard on public.station_products;
create trigger station_products_runout_guard
  before insert or update on public.station_products
  for each row execute function public.clear_elapsed_run_out();

-- ── يسقط الترحيلُ هنا لا الإشعالُ غداً ──────────────────────────────────
do $$
declare
  sid uuid;
  prod public.fuel_product;
  kept_future timestamptz;
  cleared timestamptz;
  kept_off timestamptz;
begin
  assert exists (
    select 1 from pg_trigger
     where tgrelid = 'public.station_products'::regclass
       and tgname = 'station_products_runout_guard' and not tgisinternal
  ), 'الحارسُ لم يُنشأ';

  select sp.station_id, sp.product into sid, prod
    from station_products sp order by sp.station_id, sp.product limit 1;
  if sid is null then return; end if;

  begin
    -- ١ · إشعالٌ على موعدٍ مضى: يُصفَّر
    update station_products set is_available = true, runs_out_at = now() - interval '7 days'
     where station_id = sid and product = prod;
    select runs_out_at into cleared from station_products where station_id = sid and product = prod;

    -- ٢ · وموعدٌ لم يحن يبقى
    update station_products set is_available = true, runs_out_at = now() + interval '3 hours'
     where station_id = sid and product = prod;
    select runs_out_at into kept_future from station_products where station_id = sid and product = prod;

    -- ٣ · والمطفأُ يحتفظ بموعده (expire_run_outs تعتمد عليه)
    update station_products set is_available = false, runs_out_at = now() - interval '2 days'
     where station_id = sid and product = prod;
    select runs_out_at into kept_off from station_products where station_id = sid and product = prod;

    raise exception 'runout-probe-rollback';
  exception when others then
    if sqlerrm <> 'runout-probe-rollback' then raise; end if;
  end;

  assert cleared is null, 'إشعالٌ على موعدٍ مضى لم يُصفَّر';
  assert kept_future is not null, 'مُحي موعدٌ لم يحن';
  assert kept_off is not null, 'مُحي موعدُ صفٍّ مطفأ';
end $$;

commit;
