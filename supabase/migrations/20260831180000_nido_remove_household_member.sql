-- =============================================================================
-- Nido remove household member
--
-- Problem this solves:
--   Owners could invite and transfer, but could not remove another member.
--   Only self-leave existed (leave_household). Clients have no UPDATE/DELETE
--   policy on household_members, so an owner cannot set another user's left_at
--   from the browser.
--
-- Why SECURITY DEFINER (not INVOKER):
--   Same reason as leave_household / transfer_household_ownership.
--   SECURITY INVOKER would require an UPDATE policy on household_members.
--   Granting UPDATE would let a client change role or left_at arbitrarily.
--   The function uses auth.uid() as the only actor identity, pins search_path,
--   takes no household_id from the client, and is granted only to authenticated.
--
-- Effect:
--   Sets left_at on the target's active membership in the caller's Nido.
--   Deactivates that member's recurring_incomes in that Nido (same as leave).
--   Does not delete the row, rewrite financial history, or remove an owner.
--   The caller cannot remove themselves (use leave_household).
--
-- Destructive changes: none. Data loss: none.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_household_member(p_target_user_id uuid)
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

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_remove_target'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_target_user_id = v_user_id THEN
    RAISE EXCEPTION 'nido.cannot_remove_self'
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
    AND user_id = p_target_user_id
    AND left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_remove_target'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_target.role <> 'member' THEN
    RAISE EXCEPTION 'nido.invalid_remove_target'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.recurring_incomes
  SET is_active = false
  WHERE household_id = v_target.household_id
    AND member_id = p_target_user_id
    AND is_active = true;

  UPDATE public.household_members
  SET left_at = now()
  WHERE id = v_target.id
    AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_remove_target'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.remove_household_member(uuid) IS
  'Sets left_at on an active member of the caller''s Nido. Owner-only. Deactivates that member''s recurring_incomes. Does not delete the row or rewrite financial history. Cannot remove self or an owner. SECURITY DEFINER because household_members has no client UPDATE policy. auth.uid() is the only actor identity. Does not take household_id from the client.';

REVOKE ALL ON FUNCTION public.remove_household_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid) TO authenticated;
