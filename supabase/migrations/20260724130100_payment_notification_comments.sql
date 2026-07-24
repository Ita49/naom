-- M6 lands the payment-verified/rejected push as a call from the admin
-- client to /api/notifications/payment-status immediately after this
-- RPC succeeds (not from inside the function itself — sending a web
-- push requires VAPID/HTTP work Postgres isn't suited to). Recreating
-- both functions purely to replace the M3-era TODO(M6) comments so they
-- don't go stale now that the notification pipeline exists.

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

  -- M6: caller (verification-queue.tsx) posts to
  -- /api/notifications/payment-status after this RPC succeeds, which
  -- sends the push and writes the notifications row.
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

  -- M6: caller (verification-queue.tsx) posts to
  -- /api/notifications/payment-status after this RPC succeeds, which
  -- sends the push and writes the notifications row.
end;
$$;

revoke execute on function public.approve_payment(uuid, jsonb) from public;
revoke execute on function public.reject_payment(uuid, text) from public;
grant execute on function public.approve_payment(uuid, jsonb) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
