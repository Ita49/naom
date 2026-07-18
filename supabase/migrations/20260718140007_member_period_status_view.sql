-- Derived member+period status (plan §2, research §4). Never a stored
-- column — always computed from payment_allocations vs contribution_periods
-- so it can't drift from the allocations that are the actual source of truth.
--
-- security_invoker = true is required here: without it, a Postgres view
-- runs with the view *owner's* privileges and silently bypasses the RLS
-- policies on members/payment_allocations for every caller — exactly the
-- kind of data leak plan §1 calls out RLS as the boundary against.
create view public.member_period_status
with (security_invoker = true) as
select
  m.id as member_id,
  cp.id as period_id,
  cp.period_month,
  cp.dues_amount,
  coalesce(sum(pa.amount), 0) as amount_paid,
  case
    when coalesce(sum(pa.amount), 0) = 0 then 'unpaid'
    when coalesce(sum(pa.amount), 0) < cp.dues_amount then 'partial'
    when coalesce(sum(pa.amount), 0) = cp.dues_amount then 'paid'
    else 'overpaid'
  end as status
from public.members m
cross join public.contribution_periods cp
left join public.payment_allocations pa
  on pa.member_id = m.id and pa.period_id = cp.id
group by m.id, cp.id, cp.period_month, cp.dues_amount;

grant select on public.member_period_status to authenticated;
