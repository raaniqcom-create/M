-- سطر الشريط المتحرك ووقت انتهاء الخبر.
--
-- نصّ الشريط عمود مستقل لا يُشتقّ من العنوان والمتن: الشريط سطر واحد يمرّ
-- سريعاً، والصفحة تحتمل فقرة. اشتقاقُ أحدهما من الآخر كان سيقصّ الخبر أو
-- يُطيل الشريط.
--
-- وexpires_at بدل الاعتماد على active وحده: «حتى الواحدة ظهراً» شرطٌ زمني،
-- وتركه ليد أحد يطفئه يعني خبراً باقياً بعد أن انتهى الوقود.
alter table public.announcements add column if not exists ticker     text;
alter table public.announcements add column if not exists expires_at timestamptz;

drop policy if exists "announcements: public read" on public.announcements;
create policy "announcements: public read" on public.announcements
  for select to public
  using (active and (expires_at is null or expires_at > now()));
