-- Core schema for Association Dues & Remittance Tracking (docs/02-plan.md §2).
-- gen_random_uuid() comes from pgcrypto, which Supabase enables by default,
-- but we declare it explicitly so this migration is self-contained.
create extension if not exists pgcrypto;

-- People --------------------------------------------------------------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id),
  full_name text not null,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness on email: needed so a first-login auth.users
-- row can be matched back to the members row an admin invited by email
-- (see handle_new_user() below). Plan §2 didn't spell this constraint out,
-- but the invite-then-link flow in 03-implementation.md M1 step 5 doesn't
-- work without it.
create unique index members_email_key on public.members (lower(email))
  where email is not null;

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id),
  -- Deviation from plan §2: the plan's admins table has no email column,
  -- but M1 step 5 requires inserting an admin row *before* first login and
  -- linking auth_user_id *after* first login — that match can only happen
  -- on some identifier the admin authenticates with. Email is that identifier.
  email text not null,
  full_name text not null,
  -- Single role for MVP per research §10 Q3. The bar-attendant role sketched
  -- in plan §6a will need this constraint loosened when that's built.
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

create unique index admins_email_key on public.admins (lower(email));

-- Dues configuration ----------------------------------------------------

create table public.dues_config (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount > 0),
  effective_from date not null,
  created_at timestamptz not null default now()
);

create table public.contribution_periods (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  dues_amount numeric not null check (dues_amount > 0),
  created_at timestamptz not null default now()
);

-- Payments ----------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  amount numeric not null check (amount > 0),
  paid_at date not null,
  receipt_url text,
  note text,
  source text not null check (source in ('member_submitted', 'admin_backfill', 'admin_manual')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_at timestamptz not null default now(),
  verified_by uuid references public.admins (id),
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index payments_member_id_idx on public.payments (member_id);
create index payments_status_idx on public.payments (status);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  member_id uuid not null references public.members (id),
  period_id uuid not null references public.contribution_periods (id),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- One allocation row per payment+period: an edit to an existing
  -- allocation should update this row's amount, not add a duplicate.
  unique (payment_id, period_id)
);

create index payment_allocations_member_id_idx on public.payment_allocations (member_id);
create index payment_allocations_period_id_idx on public.payment_allocations (period_id);

-- Notifications -------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  type text not null check (type in ('due_reminder', 'payment_verified', 'payment_rejected', 'overdue_nudge')),
  channel text not null check (channel in ('web_push', 'email')),
  sent_at timestamptz not null default now(),
  payload jsonb
);

create index notifications_member_id_idx on public.notifications (member_id);

-- Auth linking --------------------------------------------------------------

-- security definer + fixed search_path: runs with elevated privilege so it
-- can update members/admins regardless of the caller's RLS, and the fixed
-- search_path prevents a search-path hijack from redirecting `public.` calls.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admins
    set auth_user_id = new.id
    where auth_user_id is null and lower(email) = lower(new.email);

  update public.members
    set auth_user_id = new.id
    where auth_user_id is null and lower(email) = lower(new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security definer + stable: lets RLS policies check admin status without
-- re-triggering RLS on the admins table itself (which would recurse).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admins where auth_user_id = auth.uid()
  );
$$;
