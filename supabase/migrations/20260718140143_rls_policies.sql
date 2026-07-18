-- RLS policies (plan §1, §2; 03-implementation.md M1 step 3). This is the
-- real access-control boundary for financial data, not a UI-layer nicety —
-- every table below is financial or references a member's identity.
--
-- No delete policy is defined on any table: absence of a policy means the
-- operation is denied by default, which gives us "soft-edit history, not
-- hard deletes" (research §6) for free, everywhere, without relying on
-- app code to enforce it.

alter table public.members enable row level security;
alter table public.admins enable row level security;
alter table public.dues_config enable row level security;
alter table public.contribution_periods enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.notifications enable row level security;

-- members: a member reads/writes their own row; admins read/write all.
create policy "members select own or admin" on public.members
  for select using (auth_user_id = auth.uid() or public.is_admin());

create policy "members insert admin only" on public.members
  for insert with check (public.is_admin());

create policy "members update own or admin" on public.members
  for update using (auth_user_id = auth.uid() or public.is_admin())
  with check (auth_user_id = auth.uid() or public.is_admin());

-- admins: admin-only read/write. Rows are seeded via the service-role key
-- (bypasses RLS), so no separate "insert" bootstrap policy is needed.
create policy "admins select admin only" on public.admins
  for select using (public.is_admin());

create policy "admins insert admin only" on public.admins
  for insert with check (public.is_admin());

create policy "admins update admin only" on public.admins
  for update using (public.is_admin())
  with check (public.is_admin());

-- dues_config: any signed-in user can read (members need to know the
-- amount); only admins can write.
create policy "dues_config select authenticated" on public.dues_config
  for select using (auth.uid() is not null);

create policy "dues_config insert admin only" on public.dues_config
  for insert with check (public.is_admin());

create policy "dues_config update admin only" on public.dues_config
  for update using (public.is_admin())
  with check (public.is_admin());

-- contribution_periods: same shape as dues_config.
create policy "contribution_periods select authenticated" on public.contribution_periods
  for select using (auth.uid() is not null);

create policy "contribution_periods insert admin only" on public.contribution_periods
  for insert with check (public.is_admin());

create policy "contribution_periods update admin only" on public.contribution_periods
  for update using (public.is_admin())
  with check (public.is_admin());

-- payments: a member sees/inserts only their own; admins see all.
-- Only admins can update (approve/reject in M3) — a member cannot edit
-- their own submission after the fact, which would undermine the
-- receipt-based trust model (research §1, §6).
create policy "payments select own or admin" on public.payments
  for select using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
    or public.is_admin()
  );

create policy "payments insert own or admin" on public.payments
  for insert with check (
    (
      member_id in (select id from public.members where auth_user_id = auth.uid())
      and source = 'member_submitted'
    )
    or public.is_admin()
  );

create policy "payments update admin only" on public.payments
  for update using (public.is_admin())
  with check (public.is_admin());

-- payment_allocations: same read pattern as payments. Writes only ever
-- happen as part of an admin's approve/backfill transaction (M3, M5).
create policy "payment_allocations select own or admin" on public.payment_allocations
  for select using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
    or public.is_admin()
  );

create policy "payment_allocations insert admin only" on public.payment_allocations
  for insert with check (public.is_admin());

create policy "payment_allocations update admin only" on public.payment_allocations
  for update using (public.is_admin())
  with check (public.is_admin());

-- notifications: a member reads their own log; admins read all. Actual
-- sends happen server-side via the service-role key (M6 Edge Functions),
-- which bypasses RLS entirely — this insert policy is only a safety net
-- for an admin triggering a manual send.
create policy "notifications select own or admin" on public.notifications
  for select using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
    or public.is_admin()
  );

create policy "notifications insert admin only" on public.notifications
  for insert with check (public.is_admin());
