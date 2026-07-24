-- M7 basic validation (03-implementation.md M7 step 4): "date not in the
-- future" is enforced client-side (date input max) for UX, but per the
-- plan that's never the security boundary — this CHECK constraint is
-- the one that actually holds regardless of caller. Applies uniformly
-- to member-submitted, admin-backfill, and admin-manual payments alike,
-- since it's on the table itself, not any one insert path.
alter table public.payments
  add constraint payments_paid_at_not_future check (paid_at <= current_date);
