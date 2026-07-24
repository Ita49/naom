-- Self-service member signup: anyone with the link can register, rather
-- than requiring an admin to pre-seed their row (the original invite-then-
-- link model from M1). A first-time login with no matching members/admins
-- row now lands on /onboarding to create their own row, instead of the
-- old /not-registered dead-end.
--
-- auth_user_id = auth.uid() is the safety rail: a signed-in user can only
-- ever insert a row claiming their own identity, never someone else's —
-- this is no looser than "own or admin" everywhere else in this schema.
drop policy "members insert admin only" on public.members;

create policy "members insert self or admin" on public.members
  for insert with check (
    auth_user_id = auth.uid() or public.is_admin()
  );
