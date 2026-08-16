-- =============================================================================
-- Nido household lifecycle RPCs
--
-- Phase 8: create a Nido, look up an invitation by token, accept an
-- invitation, and leave a Nido. These functions do not change tables,
-- constraints, or RLS policies.
--
-- Why RPCs:
--   create_household     Two client inserts are not a transaction.
--                        SECURITY INVOKER so existing RLS still applies.
--   lookup_invitation    Invitees and anonymous users cannot SELECT
--                        household_invitations (owner-only RLS).
--   accept_invitation    No client UPDATE on invitations and no client
--                        INSERT of a non-owner membership.
--   leave_household      No client UPDATE on household_members. Leave
--                        must set left_at, not delete the row.
--
-- Do not use a service-role client. auth.uid() is the only user id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_household
-- Atomic household + first owner membership. RLS still applies.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_household(p_name text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.user_id = v_user_id
      AND hm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'nido.already_in_nido'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.households (name, created_by)
  VALUES (trim(p_name), v_user_id)
  RETURNING * INTO v_household;

  INSERT INTO public.household_members (
    household_id,
    user_id,
    role,
    left_at
  )
  VALUES (
    v_household.id,
    v_user_id,
    'owner',
    NULL
  );

  RETURN v_household;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'nido.already_in_nido'
      USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.create_household(text) IS
  'Creates a household and the caller''s owner membership in one transaction. SECURITY INVOKER: RLS still applies. auth.uid() is the only user id used.';

REVOKE ALL ON FUNCTION public.create_household(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- lookup_invitation
-- Public preview only: status + household name. Never returns the token.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lookup_invitation(p_token text)
RETURNS TABLE (status text, household_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.household_invitations;
  v_name text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    status := 'invalid';
    household_name := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_inv
  FROM public.household_invitations
  WHERE token = p_token;

  IF NOT FOUND THEN
    status := 'invalid';
    household_name := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT h.name
  INTO v_name
  FROM public.households AS h
  WHERE h.id = v_inv.household_id;

  IF v_inv.accepted_at IS NOT NULL THEN
    status := 'accepted';
  ELSIF v_inv.expires_at <= now() THEN
    status := 'expired';
  ELSE
    status := 'valid';
  END IF;

  household_name := v_name;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.lookup_invitation(text) IS
  'Returns invitation status and household name for a token. Does not return the token, email, or financial data. SECURITY DEFINER because invitation SELECT is owner-only.';

REVOKE ALL ON FUNCTION public.lookup_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- accept_invitation
-- Validate token, enforce one active Nido, insert member, mark accepted.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inv public.household_invitations;
  v_active_household_id uuid;
  v_household public.households;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'nido.invitation_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_inv
  FROM public.household_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invitation_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invitation_accepted'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'nido.invitation_expired'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT hm.household_id
  INTO v_active_household_id
  FROM public.household_members AS hm
  WHERE hm.user_id = v_user_id
    AND hm.left_at IS NULL;

  IF FOUND THEN
    IF v_active_household_id = v_inv.household_id THEN
      RAISE EXCEPTION 'nido.already_member'
        USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'nido.already_in_nido'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.household_members (
    household_id,
    user_id,
    role,
    left_at
  )
  VALUES (
    v_inv.household_id,
    v_user_id,
    'member',
    NULL
  );

  UPDATE public.household_invitations
  SET accepted_at = now()
  WHERE id = v_inv.id
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invitation_accepted'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_household
  FROM public.households
  WHERE id = v_inv.household_id;

  RETURN v_household;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'nido.already_in_nido'
      USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.accept_invitation(text) IS
  'Accepts an invitation for auth.uid() only. Enforces expiry, unused token, and one active Nido. Inserts a member row and sets accepted_at in one transaction.';

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- leave_household
-- Soft-leave the caller''s active membership. Last owner cannot leave.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership public.household_members;
  v_owner_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.household_members
  WHERE user_id = v_user_id
    AND left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_membership.role = 'owner' THEN
    SELECT count(*)
    INTO v_owner_count
    FROM public.household_members
    WHERE household_id = v_membership.household_id
      AND role = 'owner'
      AND left_at IS NULL;

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'nido.last_owner'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.household_members
  SET left_at = now()
  WHERE id = v_membership.id
    AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.leave_household() IS
  'Sets left_at on the caller''s active membership. Does not delete the row, household, or historical data. The last active owner cannot leave.';

REVOKE ALL ON FUNCTION public.leave_household() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_household() TO authenticated;
