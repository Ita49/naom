-- Initial seed data (03-implementation.md M1 step 5). full_name values
-- below are placeholders — update them once a member/admin "edit info"
-- screen exists (M4/M7); the emails are what actually matter for the
-- auth-linking trigger (handle_new_user in the core schema migration).
insert into public.admins (email, full_name)
values
  ('ita.godwin@gmail.com', 'Ita'),
  ('chimaebano@yahoo.co.uk', 'Treasurer')
on conflict (lower(email)) do nothing;

-- Fixed monthly dues, effective from the start of the current month.
insert into public.dues_config (amount, effective_from)
select 5000, date_trunc('month', current_date)::date
where not exists (select 1 from public.dues_config);

-- Contribution periods for the current month + the next 11 months, so
-- there's runway without needing a monthly manual step right away. This
-- insert is re-runnable: re-run it (or extend the range) monthly to keep
-- generating periods further out, per the M1 step 5 note in
-- 03-implementation.md.
insert into public.contribution_periods (period_month, dues_amount)
select gs::date, 5000
from generate_series(
  date_trunc('month', current_date),
  date_trunc('month', current_date) + interval '11 months',
  interval '1 month'
) as gs
on conflict (period_month) do nothing;
