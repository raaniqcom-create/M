-- تسجيل ما هو قائم فعلاً في قاعدة البيانات.
--
-- عمودا send_at وsent_at وتحويل ticker إلى مصفوفة طُبِّقت باستعلام مباشر أثناء
-- البناء ولم تُكتب في ملفات الهجرة. فحصٌ آليّ التقط ذلك: الكود كله يقرأ
-- عمودين لا يُنشئهما أي ملف في المستودع.
--
-- الأثر ليس اليوم — القاعدة الحيّة تحملها والكنس يعمل. الأثر أن إعادة بناء
-- القاعدة من ملفات الهجرة تُنتج مخططاً ينقصه عمودان، فتصمت المنصة صمتاً لا
-- يشير إلى سببه. الملف هذا يجعل الملفات تصف الواقع.
--
-- كلها if not exists / or replace، فتشغيله على القاعدة الحالية لا يغيّر شيئاً.

alter table public.announcements add column if not exists send_at    timestamptz;
alter table public.announcements add column if not exists sent_at    timestamptz;
alter table public.announcements add column if not exists expires_at timestamptz;

-- ticker مصفوفة لا نصّاً: الشريط يعرض سطراً لكل محطة، والكود يكتب مصفوفة
-- ويقرأ مصفوفة منذ البداية. الملف السابق كتبه text خطأً.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'announcements'
       and column_name = 'ticker' and data_type <> 'ARRAY'
  ) then
    alter table public.announcements
      alter column ticker type text[]
      using case when ticker is null then null else array[ticker] end;
  end if;
end $$;

-- خبرٌ لم يُرسَل لا يُعرض. الشرط على sent_at هو ما يمنع ظهوره في الشريط قبل
-- موعده، وكان ناقصاً في الملف الأول.
drop policy if exists "announcements: public read" on public.announcements;
create policy "announcements: public read" on public.announcements
  for select to public
  using (active and sent_at is not null and (expires_at is null or expires_at > now()));

-- فهرس على المستحقّ للإرسال. الشرط ثابت (لا now() فيه) فيصلح لفهرس جزئي.
create index if not exists announcements_due
  on public.announcements (send_at)
  where sent_at is null and active;
