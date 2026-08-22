-- =============================================================================
-- Nido owner transfer
--
-- Problem this solves:
--   Ownership lives on household_members.role (owner | member). There is no
--   households.owner_id. Clients have SELECT/INSERT on household_members and
--   no UPDATE/DELETE policy, so a browser cannot change role or left_at.
--   leave_household already rejects the last active owner. Transfer was the
--   missing atomic path: demote the caller and promote another active member
--   of the same Nido in one transaction, using auth.uid() as the actor.
--
-- Why the existing schema is enough:
--   No new tables or columns. Reuses household_members.role and left_at.
--   households.created_by stays the original creator and is not authorization.
--   Financial rows (expenses, splits, incomes, budgets, goals, contributions)
--   keep their household_id and profiles.id FKs. Creator-only mutation rules
--   are unchanged. History is not rewritten or deleted.
--
-- Why SECURITY DEFINER (not INVOKER):
--   Same reason as leave_household / accept_invitation. SECURITY INVOKER
--   would require an UPDATE policy on household_members. A row-level policy
--   cannot express "demote me and promote them together". Granting UPDATE
--   would let a client leave a Nido without an owner or promote themselves.
--   The function still uses auth.uid() as the only actor identity, pins
--   search_path, takes no household_id / owner_id from the client, and is
--   granted only to authenticated.
--
-- Destructive changes: none. Data loss: none.
-- Apply only on nido_dev. Do not apply to production from this phase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.transfer_household_ownership(p_new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller public.household_members;
  v_target public.household_members;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_new_owner_id IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_transfer_target'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_new_owner_id = v_user_id THEN
    RAISE EXCEPTION 'nido.cannot_transfer_to_self'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_caller
  FROM public.household_members
  WHERE user_id = v_user_id
    AND left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_caller.role <> 'owner' THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  -- Same household only. A miss covers other Nidos, historical members,
  -- and unknown ids without leaking which case it was.
  SELECT *
  INTO v_target
  FROM public.household_members
  WHERE household_id = v_caller.household_id
    AND user_id = p_new_owner_id
    AND left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_transfer_target'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'nido.invalid_transfer_target'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.household_members
  SET role = 'member'
  WHERE id = v_caller.id
    AND role = 'owner'
    AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.household_members
  SET role = 'owner'
  WHERE id = v_target.id
    AND role = 'member'
    AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_transfer_target'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.transfer_household_ownership(uuid) IS
  'Atomically demotes auth.uid() from owner to member and promotes an active member of the same Nido. SECURITY DEFINER because household_members has no client UPDATE policy. auth.uid() is the only actor identity. Does not take household_id or owner_id from the client.';

REVOKE ALL ON FUNCTION public.transfer_household_ownership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_household_ownership(uuid) TO authenticated;
