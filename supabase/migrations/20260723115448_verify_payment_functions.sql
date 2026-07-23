-- Admin approve/reject actions (03-implementation.md M3 steps 3-4).
-- Both run as a single Postgres function call so the multi-statement
-- writes commit or roll back together — no partial-failure window between
-- inserting allocations and flipping payments.status.
--
-- security invoker (the default, stated explicitly) is deliberate: these
-- functions don't bypass RLS, they rely on it. The admin-only RLS policies
-- on payments/payment_allocations already exist (rls_policies migration);
-- a non-admin caller fails at the same RLS checks it would hit doing this
-- by hand, so there's no separate privilege model to keep in sync.

create or replace function public.approve_payment(
  p_payment_id uuid,
  p_allocations jsonb -- array of {"period_id": uuid, "amount": numeric}
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_member_id uuid;
  v_amount numeric;
  v_allocated numeric;
  v_admin_id uuid;
  v_item jsonb;
begin
  select member_id, amount into v_member_id, v_amount
  from public.payments
  where id = p_payment_id and status = 'pending'
  for update;

  if v_member_id is null then
    raise exception 'Payment % not found or not pending', p_payment_id;
  end if;

  select id into v_admin_id from public.admins where auth_user_id = auth.uid();
  if v_admin_id is null then
    raise exception 'Only admins can approve payments';
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0)
  into v_allocated
  from jsonb_array_elements(p_allocations) as item;

  if v_allocated <= 0 then
    raise exception 'At least one positive allocation is required';
  end if;

  if v_allocated > v_amount then
    raise exception 'Allocated amount % exceeds payment amount %', v_allocated, v_amount;
  end if;

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    insert into public.payment_allocations (payment_id, member_id, period_id, amount)
    values (
      p_payment_id,
      v_member_id,
      (v_item ->> 'period_id')::uuid,
      (v_item ->> 'amount')::numeric
    );
  end loop;

  update public.payments
  set status = 'verified',
      verified_by = v_admin_id,
      verified_at = now()
  where id = p_payment_id;

  -- TODO(M6): write a notifications row / trigger the "payment verified"
  -- push here once the notification pipeline exists.
end;
$$;

create or replace function public.reject_payment(
  p_payment_id uuid,
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
    raise exception 'Only admins can reject payments';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;

  update public.payments
  set status = 'rejected',
      rejection_reason = p_reason
  where id = p_payment_id and status = 'pending'
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Payment % not found or not pending', p_payment_id;
  end if;

  -- TODO(M6): write a notifications row / trigger the "payment rejected"
  -- push here once the notification pipeline exists.
end;
$$;

revoke execute on function public.approve_payment(uuid, jsonb) from public;
revoke execute on function public.reject_payment(uuid, text) from public;
grant execute on function public.approve_payment(uuid, jsonb) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
