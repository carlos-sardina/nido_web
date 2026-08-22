-- Phase 9.1.3A — goal create / update / archive authorization
--
-- Product rule:
--   auth.uid() → active household membership → goals.household_id
--   → goals.created_by = auth.uid()
--
-- Any historical member may SELECT. Any active member may INSERT
-- (created_by = auth.uid()). Only the creator may UPDATE (edit or archive).
-- Physical DELETE remains revoked. Archive uses goals.status = archived.
-- Existing applied migrations are not modified.
--
-- No current_amount column. Progress stays SUM(goal_contributions.amount).
-- This phase does not add contribution mutations.

-- -----------------------------------------------------------------------------
-- goals UPDATE: creator + active member + not already archived
-- WITH CHECK allows setting status = archived but keeps created_by.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS goals_update_active_members ON public.goals;

CREATE POLICY goals_update_creator
  ON public.goals
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND status IS DISTINCT FROM 'archived'
  )
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- create_goal
-- SECURITY INVOKER: existing RLS remains the authorization authority.
-- household_id is the active Nido from the client session; membership is
-- re-checked here and again by RLS. created_by is always auth.uid().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_goal(
  p_household_id uuid,
  p_name text,
  p_target_amount numeric,
  p_goal_type public.goal_type,
  p_target_date date,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(12, 2);
  v_name text;
  v_description text;
  v_goal_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_household_id IS NULL OR NOT public.is_active_household_member(p_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_target_amount IS NULL OR p_target_amount <= 0 OR p_target_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  v_amount := round(p_target_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_goal_type IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' THEN
    v_description := NULL;
  ELSIF char_length(v_description) > 160 THEN
    RAISE EXCEPTION 'nido.invalid_description'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.goals (
    household_id,
    name,
    description,
    goal_type,
    target_amount,
    target_date,
    status,
    created_by
  ) VALUES (
    p_household_id,
    v_name,
    v_description,
    p_goal_type,
    v_amount,
    p_target_date,
    'active',
    v_user_id
  )
  RETURNING id INTO v_goal_id;

  RETURN v_goal_id;
END;
$$;

COMMENT ON FUNCTION public.create_goal(uuid, text, numeric, public.goal_type, date, text) IS
  'Creates an active household goal. SECURITY INVOKER: RLS still applies. created_by is auth.uid(). Does not store current_amount.';

REVOKE ALL ON FUNCTION public.create_goal(uuid, text, numeric, public.goal_type, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_goal(uuid, text, numeric, public.goal_type, date, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- update_goal
-- Looks up household_id from the row. Does not trust a client household id.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_goal(
  p_goal_id uuid,
  p_name text,
  p_target_amount numeric,
  p_goal_type public.goal_type,
  p_target_date date,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_created_by uuid;
  v_status public.goal_status;
  v_amount numeric(12, 2);
  v_name text;
  v_description text;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_goal_id IS NULL THEN
    RAISE EXCEPTION 'nido.goal_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, status
  INTO v_household_id, v_created_by, v_status
  FROM public.goals
  WHERE id = p_goal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.goal_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nido.goal_archived'
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

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_target_amount IS NULL OR p_target_amount <= 0 OR p_target_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  v_amount := round(p_target_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_goal_type IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' THEN
    v_description := NULL;
  ELSIF char_length(v_description) > 160 THEN
    RAISE EXCEPTION 'nido.invalid_description'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.goals
  SET
    name = v_name,
    description = v_description,
    goal_type = p_goal_type,
    target_amount = v_amount,
    target_date = p_target_date
  WHERE id = p_goal_id
    AND created_by = v_user_id
    AND status IS DISTINCT FROM 'archived';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.goal_archived'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_goal_id;
END;
$$;

COMMENT ON FUNCTION public.update_goal(uuid, text, numeric, public.goal_type, date, text) IS
  'Updates a non-archived goal. SECURITY INVOKER: RLS still applies. Household comes from the row. Only the creator with an active membership may mutate.';

REVOKE ALL ON FUNCTION public.update_goal(uuid, text, numeric, public.goal_type, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_goal(uuid, text, numeric, public.goal_type, date, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- archive_goal
-- Sets status = archived. Does not delete goal_contributions.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_goal(p_goal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_created_by uuid;
  v_status public.goal_status;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_goal_id IS NULL THEN
    RAISE EXCEPTION 'nido.goal_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, status
  INTO v_household_id, v_created_by, v_status
  FROM public.goals
  WHERE id = p_goal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.goal_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nido.goal_archived'
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

  UPDATE public.goals
  SET status = 'archived'
  WHERE id = p_goal_id
    AND created_by = v_user_id
    AND status IS DISTINCT FROM 'archived';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.goal_archived'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_goal_id;
END;
$$;

COMMENT ON FUNCTION public.archive_goal(uuid) IS
  'Archives a goal by setting status = archived. SECURITY INVOKER: RLS still applies. Contributions are preserved. Only the creator with an active membership may archive.';

REVOKE ALL ON FUNCTION public.archive_goal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_goal(uuid) TO authenticated;
