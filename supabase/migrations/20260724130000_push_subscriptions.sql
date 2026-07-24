-- Web push subscriptions (03-implementation.md M6 step 2). One row per
-- browser/device a member has granted notification permission on — a
-- member can have several (phone + desktop), so this is keyed by the
-- push endpoint, not the member.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_member_id_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

-- Same "own or admin" read shape as payments/notifications: the M3
-- approve/reject action needs to look up the target member's
-- subscriptions from the admin's own session to send a push.
create policy "push_subscriptions select own or admin" on public.push_subscriptions
  for select using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
    or public.is_admin()
  );

-- A member registers only their own device; admins never need to
-- register a subscription on a member's behalf.
create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert with check (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

create policy "push_subscriptions update own" on public.push_subscriptions
  for update using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  ) with check (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

-- Unlike the financial tables, a delete policy here is deliberate, not
-- an oversight: a push subscription is disposable device-registration
-- metadata (the browser can invalidate it at any time), not something
-- that needs soft-edit history. The server-side sender also prunes
-- subscriptions the push service reports as gone (410), via the
-- service-role key, which bypasses RLS entirely.
create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );
