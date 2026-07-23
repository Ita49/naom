-- Private bucket for receipt images (plan §3.2, M2 step 4). Objects are
-- stored at "<member_id>/<filename>" so a member's own folder can be
-- checked against their id in the RLS policies below.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- security definer + stable, same rationale as is_admin(): lets storage
-- policies check "is this my folder" without recursing through RLS on
-- members itself.
create or replace function public.current_member_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.members where auth_user_id = auth.uid();
$$;

create policy "receipts insert own or admin" on storage.objects
  for insert
  with check (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = current_member_id()::text
      or public.is_admin()
    )
  );

create policy "receipts select own or admin" on storage.objects
  for select
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = current_member_id()::text
      or public.is_admin()
    )
  );
