-- Phase 9.1.3B — goal contribution create authorization
--
-- Product rule (create):
--   auth.uid() → active household membership → goal.household_id
--   → goals.status = active
--
-- Any active member of the Nido may contribute to an active goal of that
-- Nido. The goal creator does not matter. created_by and member_id are
-- always auth.uid(); the client cannot attribute a contribution to someone
-- else. A client-supplied goal_id is never enough: household, membership,
-- and status are resolved from the goal row.
--
-- Over-target contributions are allowed. Progress stays
-- SUM(goal_contributions.amount) / goals.target_amount. This phase does
-- not persist status = completed and does not add current_amount.
--
-- Edit / delete are not implemented. goal_contributions has no deleted_at.
-- Existing UPDATE/DELETE policies are left unchanged (any active member).
-- Soft-delete would require a new column and is deferred.
--
-- Existing applied migrations are not modified.

-- -----------------------------------------------------------------------------
-- Read-only helper: active (not archived / not completed) goal.
-- SECURITY DEFINER only to avoid nested goals RLS from contribution policies.
-- It does not write and does not grant access by itself.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.goal_is_active(p_goal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.goals AS g
    WHERE g.id = p_goal_id
      AND g.status = 'active'
  );
$$;

COMMENT ON FUNCTION public.goal_is_active(uuid) IS
  'True when the goal exists and status is active. SECURITY DEFINER avoids nested goals RLS when evaluating goal_contributions policies.';

REVOKE ALL ON FUNCTION public.goal_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goal_is_active(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- INSERT: active member of the goal's Nido, contributor is auth.uid(),
-- goal is active. Does not trust a client household id or member id.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS goal_contributions_insert_active_members ON public.goal_contributions;

CREATE POLICY goal_contributions_insert_active_members
  ON public.goal_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
    AND created_by = auth.uid()
    AND member_id = auth.uid()
    AND public.goal_is_active(goal_id)
  );

-- -----------------------------------------------------------------------------
-- create_goal_contribution
-- SECURITY INVOKER: existing RLS remains the authorization authority.
-- Household is looked up from the goal. created_by / member_id are auth.uid().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_goal_contribution(
  p_goal_id uuid,
  p_amount numeric,
  p_contributed_at date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_status public.goal_status;
  v_amount numeric(12, 2);
  v_contribution_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_goal_id IS NULL THEN
    RAISE EXCEPTION 'nido.goal_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, status
  INTO v_household_id, v_status
  FROM public.goals
  WHERE id = p_goal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.goal_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'nido.goal_archived'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_contributed_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.goal_contributions (
    goal_id,
    member_id,
    amount,
    contributed_at,
    created_by
  ) VALUES (
    p_goal_id,
    v_user_id,
    v_amount,
    p_contributed_at,
    v_user_id
  )
  RETURNING id INTO v_contribution_id;

  RETURN v_contribution_id;
END;
$$;

COMMENT ON FUNCTION public.create_goal_contribution(uuid, numeric, date) IS
  'Creates a contribution to an active household goal. SECURITY INVOKER: RLS still applies. member_id and created_by are auth.uid(). Does not cap the sum at target_amount and does not mark the goal completed.';

REVOKE ALL ON FUNCTION public.create_goal_contribution(uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_goal_contribution(uuid, numeric, date) TO authenticated;
