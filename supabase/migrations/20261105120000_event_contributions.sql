-- Event-based contributions (one-off drives, e.g. "support a member"),
-- distinct from the recurring monthly dues ledger (payments/allocations).
--
-- Why a separate pair of tables rather than reusing payments: a payment
-- allocates against contribution_periods with a fixed dues_amount; an event
-- contribution has no period and no fixed amount, is often made by a GUEST
-- (someone with the share link who may not be an app member at all), and is
-- never part of a member's dues standing. Forcing it through payments would
-- have meant nullable member_id + a null period allocation + a new source
-- enum value on the financial ledger — more coupling and more risk than a
-- clean, parallel pair of tables that reuse the same pending/verified/
-- rejected lifecycle and the same private-receipt + admin-verify pattern.

-- Events ----------------------------------------------------------------

create table public.contribution_events (
  id uuid primary key default gen_random_uuid(),
  -- Unguessable token that goes in the share link (/events/<slug>). Not the
  -- id: the id leaks nothing by itself, but the slug is what gets pasted into
  -- WhatsApp groups, so we want it to be the thing we can rotate/revoke
  -- later without touching foreign keys. Generated app-side on create.
  slug text not null unique,
  title text not null,
  description text,
  -- The member being supported, when the drive is for a member. Optional:
  -- an event can support a non-member (free-text name) or a general cause.
  beneficiary_member_id uuid references public.members (id),
  beneficiary_name text,
  -- Optional fundraising target, only for a progress bar. Null = no target.
  goal_amount numeric check (goal_amount > 0),
  -- 'closed' hides the contribute form on the public page and stops new
  -- guest submissions server-side; existing contributions stay visible.
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.admins (id),
  created_at timestamptz not null default now()
);

create index contribution_events_status_idx on public.contribution_events (status);

-- Contributions ----------------------------------------------------------

create table public.event_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.contribution_events (id) on delete cascade,
  -- Nullable: a guest contributing via the share link has no members row.
  -- When a signed-in member contributes, the server route links them here
  -- so the members-only list can mark their own entries.
  member_id uuid references public.members (id),
  -- Always captured, even for members, so the list reads naturally without
  -- a join back to members for the common guest case.
  contributor_name text not null,
  contributor_phone text,
  amount numeric not null check (amount > 0),
  paid_at date,
  -- Storage path in the private 'event-receipts' bucket; nullable because a
  -- receipt can be added but the admin still confirms the amount in-account.
  receipt_url text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_by uuid references public.admins (id),
  verified_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index event_contributions_event_id_idx on public.event_contributions (event_id);
create index event_contributions_status_idx on public.event_contributions (status);

-- Derived totals (never stored) -----------------------------------------

-- security_invoker = true for the same reason as member_period_status: the
-- view must run under the caller's RLS, not the owner's, so it can't leak
-- past the select policies on the two tables below.
create view public.event_totals
with (security_invoker = true) as
select
  e.id as event_id,
  coalesce(sum(ec.amount) filter (where ec.status = 'verified'), 0) as verified_total,
  coalesce(sum(ec.amount) filter (where ec.status = 'pending'), 0) as pending_total,
  count(ec.id) filter (where ec.status = 'verified') as verified_count,
  count(ec.id) filter (where ec.status = 'pending') as pending_count
from public.contribution_events e
left join public.event_contributions ec on ec.event_id = e.id
group by e.id;

grant select on public.event_totals to authenticated;

-- RLS --------------------------------------------------------------------

alter table public.contribution_events enable row level security;
alter table public.event_contributions enable row level security;

-- Events: every signed-in user can read (the view-only contributor list and
-- the member events screen both need this). Only admins create/close them.
-- NOTE: the public share page at /events/<slug> is rendered server-side with
-- the service-role key (no session), so it does NOT rely on an anon policy
-- here — this keeps the publicly-held anon key with zero direct read access
-- to the events table.
create policy "contribution_events select authenticated" on public.contribution_events
  for select using (auth.uid() is not null);

create policy "contribution_events insert admin only" on public.contribution_events
  for insert with check (public.is_admin());

create policy "contribution_events update admin only" on public.contribution_events
  for update using (public.is_admin())
  with check (public.is_admin());

-- Contributions: every signed-in user reads the full list (names + amounts +
-- status were the explicit product decision). Only admins write through RLS;
-- guest submissions come in through the service-role server route, which
-- bypasses RLS after validating the slug and the event's open status. Keeping
-- the anon key off this table is what prevents the share link from being a
-- direct write primitive for spam/forged rows.
create policy "event_contributions select authenticated" on public.event_contributions
  for select using (auth.uid() is not null);

create policy "event_contributions insert admin only" on public.event_contributions
  for insert with check (public.is_admin());

create policy "event_contributions update admin only" on public.event_contributions
  for update using (public.is_admin())
  with check (public.is_admin());

-- Storage: private bucket for event receipts -----------------------------

insert into storage.buckets (id, name, public)
values ('event-receipts', 'event-receipts', false)
on conflict (id) do nothing;

-- Admins view receipts in the verification queue through their cookie-scoped
-- client, so they need a select policy. Guest uploads are done by the
-- service-role route (bypasses storage RLS), so no insert policy for them is
-- needed; the admin insert policy covers an admin adding one by hand.
-- Members deliberately get no access: the list shows amounts + status, not
-- the underlying receipt images.
create policy "event-receipts select admin only" on storage.objects
  for select
  using (bucket_id = 'event-receipts' and public.is_admin());

create policy "event-receipts insert admin only" on storage.objects
  for insert
  with check (bucket_id = 'event-receipts' and public.is_admin());

-- Admin approve / reject -------------------------------------------------

-- Mirrors approve_payment/reject_payment (verify_payment_functions migration)
-- but simpler: an event contribution has no period allocation, so approval is
-- just "the treasurer confirmed this amount landed in the account" -> flip to
-- verified. security invoker (explicit) so the admin-only RLS above is the
-- single privilege check, not a second model to keep in sync.

create or replace function public.verify_event_contribution(
  p_contribution_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_updated_id uuid;
begin
  select id into v_admin_id from public.admins where auth_user_id = auth.uid();
  if v_admin_id is null then
    raise exception 'Only admins can verify contributions';
  end if;

  update public.event_contributions
  set status = 'verified',
      verified_by = v_admin_id,
      verified_at = now(),
      rejection_reason = null
  where id = p_contribution_id and status = 'pending'
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Contribution % not found or not pending', p_contribution_id;
  end if;
end;
$$;

create or replace function public.reject_event_contribution(
  p_contribution_id uuid,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_updated_id uuid;
begin
  select id into v_admin_id from public.admins where auth_user_id = auth.uid();
  if v_admin_id is null then
    raise exception 'Only admins can reject contributions';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;

  update public.event_contributions
  set status = 'rejected',
      verified_by = v_admin_id,
      verified_at = now(),
      rejection_reason = p_reason
  where id = p_contribution_id and status = 'pending'
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Contribution % not found or not pending', p_contribution_id;
  end if;
end;
$$;

revoke execute on function public.verify_event_contribution(uuid) from public;
revoke execute on function public.reject_event_contribution(uuid, text) from public;
grant execute on function public.verify_event_contribution(uuid) to authenticated;
grant execute on function public.reject_event_contribution(uuid, text) to authenticated;
