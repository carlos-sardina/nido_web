-- Phase 9.1.3D — goal contribution update / soft-delete authorization
--
-- Product rule:
--   auth.uid() → active household membership → goals.household_id
--   (looked up from goal_contributions.goal_id, never a client household_id)
--   → goal_contributions.created_by = auth.uid()
--   → goal_contributions.deleted_at IS NULL
--   → goals.status = active
--
-- The creator may edit or soft-delete. Other members may SELECT.
-- Historical members and other households cannot mutate.
-- Already-deleted contributions cannot be mutated again.
-- An archived goal cannot receive new contributions or mutation of existing ones.
--
-- Physical DELETE is revoked. Soft-delete uses goal_contributions.deleted_at.
-- Progress stays SUM(amount) WHERE deleted_at IS NULL. No current_amount.
-- Existing applied migrations are not modified.

-- -----------------------------------------------------------------------------
-- Schema: soft-delete column. Do not hard-delete contribution rows.
-- -----------------------------------------------------------------------------

ALTER TABLE public.goal_contributions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.goal_contributions.deleted_at IS
  'Soft-delete timestamp. NULL means the contribution is active and participates in progress, totals, and activity.';

COMMENT ON TABLE public.goal_contributions IS
  'Individual contributions toward a Nido goal. Multiple contributions per member are allowed. Leaving a Nido does not delete these rows. Soft-delete via deleted_at; do not hard-delete.';

REVOKE DELETE ON TABLE public.goal_contributions FROM authenticated;

-- -----------------------------------------------------------------------------
-- UPDATE: creator + active member + not already deleted + parent goal active.
-- WITH CHECK allows setting deleted_at (soft-delete) but keeps identity
-- columns and requires the parent goal to still be active.
-- Household is always resolved from goal_id.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS goal_contributions_update_active_members ON public.goal_contributions;
DROP POLICY IF EXISTS goal_contributions_update_creator ON public.goal_contributions;

CREATE POLICY goal_contributions_update_creator
  ON public.goal_contributions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
    AND created_by = auth.uid()
    AND deleted_at IS NULL
    AND public.goal_is_active(goal_id)
  )
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
    AND created_by = auth.uid()
    AND member_id = auth.uid()
    AND public.goal_is_active(goal_id)
  );

-- -----------------------------------------------------------------------------
-- DELETE: creator-only + active member + not already deleted + goal active.
-- Privilege is revoked above; this policy remains so a restored GRANT cannot
-- let another member physically delete. Product delete is soft-delete via UPDATE.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS goal_contributions_delete_active_members ON public.goal_contributions;
DROP POLICY IF EXISTS goal_contributions_delete_creator ON public.goal_contributions;

CREATE POLICY goal_contributions_delete_creator
  ON public.goal_contributions
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
    AND created_by = auth.uid()
    AND deleted_at IS NULL
    AND public.goal_is_active(goal_id)
  );

-- -----------------------------------------------------------------------------
-- update_goal_contribution
-- SECURITY INVOKER: existing RLS remains the authorization authority.
-- Household is looked up from the contribution's goal. Does not take
-- household_id, member_id, created_by, or a client goal_id.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_goal_contribution(
  p_contribution_id uuid,
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
  v_goal_id uuid;
  v_household_id uuid;
  v_created_by uuid;
  v_deleted_at timestamptz;
  v_status public.goal_status;
  v_amount numeric(12, 2);
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_contribution_id IS NULL THEN
    RAISE EXCEPTION 'nido.contribution_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.goal_id, c.created_by, c.deleted_at, g.household_id, g.status
  INTO v_goal_id, v_created_by, v_deleted_at, v_household_id, v_status
  FROM public.goal_contributions AS c
  JOIN public.goals AS g ON g.id = c.goal_id
  WHERE c.id = p_contribution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.contribution_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.contribution_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'nido.goal_archived'
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

  UPDATE public.goal_contributions
  SET
    amount = v_amount,
    contributed_at = p_contributed_at
  WHERE id = p_contribution_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.contribution_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_contribution_id;
END;
$$;

COMMENT ON FUNCTION public.update_goal_contribution(uuid, numeric, date) IS
  'Updates amount and date of a contribution. SECURITY INVOKER: RLS still applies. Household is resolved from the parent goal. Only the creator with an active membership may mutate a non-deleted contribution on an active goal.';

REVOKE ALL ON FUNCTION public.update_goal_contribution(uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_goal_contribution(uuid, numeric, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- soft_delete_goal_contribution
-- Sets deleted_at. Does not physically delete the row.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_goal_contribution(p_contribution_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_created_by uuid;
  v_deleted_at timestamptz;
  v_status public.goal_status;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_contribution_id IS NULL THEN
    RAISE EXCEPTION 'nido.contribution_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.created_by, c.deleted_at, g.household_id, g.status
  INTO v_created_by, v_deleted_at, v_household_id, v_status
  FROM public.goal_contributions AS c
  JOIN public.goals AS g ON g.id = c.goal_id
  WHERE c.id = p_contribution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.contribution_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.contribution_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'nido.goal_archived'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.goal_contributions
  SET deleted_at = now()
  WHERE id = p_contribution_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.contribution_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_contribution_id;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_goal_contribution(uuid) IS
  'Soft-deletes a contribution by setting deleted_at. SECURITY INVOKER: RLS still applies. The row is preserved. Only the creator with an active membership may delete a non-deleted contribution on an active goal.';

REVOKE ALL ON FUNCTION public.soft_delete_goal_contribution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_goal_contribution(uuid) TO authenticated;
