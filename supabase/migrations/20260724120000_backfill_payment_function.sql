-- Admin backfill action (03-implementation.md M5 steps 1-2). Mirrors
-- approve_payment's shape: a single function so the payment row and its
-- allocations commit or roll back together, and so RLS (not app code) is
-- still the privilege boundary for who can call this.

create or replace function public.backfill_payment(
  p_member_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_note text,
  p_allocations jsonb -- array of {"period_id": uuid, "amount": numeric}
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_allocated numeric;
  v_payment_id uuid;
  v_item jsonb;
begin
  select id into v_admin_id from public.admins where auth_user_id = auth.uid();
  if v_admin_id is null then
    raise exception 'Only admins can backfill payments';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0)
  into v_allocated
  from jsonb_array_elements(p_allocations) as item;

  if v_allocated <= 0 then
    raise exception 'At least one positive allocation is required';
  end if;

  if v_allocated > p_amount then
    raise exception 'Allocated amount % exceeds payment amount %', v_allocated, p_amount;
  end if;

  insert into public.payments (
    member_id, amount, paid_at, note, source, status, verified_by, verified_at
  )
  values (
    p_member_id, p_amount, p_paid_at, p_note, 'admin_backfill', 'verified', v_admin_id, now()
  )
  returning id into v_payment_id;

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    insert into public.payment_allocations (payment_id, member_id, period_id, amount)
    values (
      v_payment_id,
      p_member_id,
      (v_item ->> 'period_id')::uuid,
      (v_item ->> 'amount')::numeric
    );
  end loop;

  return v_payment_id;
end;
$$;

revoke execute on function public.backfill_payment(uuid, numeric, date, text, jsonb) from public;
grant execute on function public.backfill_payment(uuid, numeric, date, text, jsonb) to authenticated;
