-- Goals and funds may be personal or shared.
--
-- goal_type stays the product split:
--   saving  = fondo (reserve)
--   purchase = meta (target / purchase)
-- scope reuses expense_scope:
--   shared   = Nido (default; existing rows stay shared)
--   personal = owner only, subject to personal_visibility
--
-- Months of support use only shared funds (saving + shared).
-- Purchase goals and personal funds never enter that numerator.
-- Existing applied migrations are not modified.

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------

ALTER TABLE public.goals
  ADD COLUMN scope public.expense_scope NOT NULL DEFAULT 'shared';

COMMENT ON COLUMN public.goals.scope IS
  'personal = owner''s fund or goal. shared = Nido. Default shared matches previous household-level rows. Personal SELECT follows profiles.personal_visibility of created_by.';

COMMENT ON TABLE public.goals IS
  'Nido or personal saving funds (goal_type = saving) and purchase goals (goal_type = purchase). Progress is SUM(goal_contributions.amount) WHERE deleted_at IS NULL. Shared saving funds are the only source for months of support.';

COMMENT ON COLUMN public.profiles.personal_visibility IS
  'Global preference for the owner''s personal expenses, personal budgets, personal savings, and personal goals/funds. nido = household peers may SELECT. private = only the owner. Shared/Nido rows ignore this column.';

COMMENT ON FUNCTION public.personal_finance_visible(uuid) IS
  'True when auth.uid() may read p_owner_id''s personal finance rows (expenses, budgets, savings, goals). The owner always can. Peers can only when profiles.personal_visibility = nido. SECURITY DEFINER reads that column without requiring peers to SELECT it. Does not grant household access by itself; policies still require membership.';

-- ---------------------------------------------------------------------------
-- 2. Visibility helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.goal_is_visible(p_goal_id uuid)
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
      AND (
        g.scope = 'shared'
        OR public.personal_finance_visible(g.created_by)
      )
  );
$$;

COMMENT ON FUNCTION public.goal_is_visible(uuid) IS
  'True when the goal exists and the caller may read it: shared, or personal with personal_finance_visible(created_by). SECURITY DEFINER avoids nested goals RLS from contribution policies. Does not grant household access by itself.';

REVOKE ALL ON FUNCTION public.goal_is_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goal_is_visible(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.goal_accepts_contribution(p_goal_id uuid)
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
      AND (
        g.scope = 'shared'
        OR g.created_by = auth.uid()
      )
  );
$$;

COMMENT ON FUNCTION public.goal_accepts_contribution(uuid) IS
  'True when the goal is active and the caller may contribute: any active member on a shared goal, only the creator on a personal goal. SECURITY DEFINER avoids nested goals RLS.';

REVOKE ALL ON FUNCTION public.goal_accepts_contribution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goal_accepts_contribution(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. SELECT / INSERT policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS goals_select_members ON public.goals;

CREATE POLICY goals_select_members
  ON public.goals
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id)
    AND (
      scope = 'shared'
      OR public.personal_finance_visible(created_by)
    )
  );

DROP POLICY IF EXISTS goal_contributions_select_members ON public.goal_contributions;

CREATE POLICY goal_contributions_select_members
  ON public.goal_contributions
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(public.household_id_for_goal(goal_id))
    AND public.goal_is_visible(goal_id)
  );

DROP POLICY IF EXISTS goal_contributions_insert_active_members ON public.goal_contributions;

CREATE POLICY goal_contributions_insert_active_members
  ON public.goal_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
    AND created_by = auth.uid()
    AND member_id = auth.uid()
    AND public.goal_accepts_contribution(goal_id)
  );

-- ---------------------------------------------------------------------------
-- 4. create_goal — p_scope, default shared
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_goal(uuid, text, numeric, public.goal_type, date, text);

CREATE OR REPLACE FUNCTION public.create_goal(
  p_household_id uuid,
  p_name text,
  p_target_amount numeric,
  p_goal_type public.goal_type,
  p_target_date date,
  p_description text,
  p_scope public.expense_scope DEFAULT 'shared'
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
  v_scope public.expense_scope;
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

  IF p_scope IS NULL OR p_scope NOT IN ('personal', 'shared') THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;
  v_scope := p_scope;

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
    scope,
    created_by
  ) VALUES (
    p_household_id,
    v_name,
    v_description,
    p_goal_type,
    v_amount,
    p_target_date,
    'active',
    v_scope,
    v_user_id
  )
  RETURNING id INTO v_goal_id;

  RETURN v_goal_id;
END;
$$;

COMMENT ON FUNCTION public.create_goal(uuid, text, numeric, public.goal_type, date, text, public.expense_scope) IS
  'Creates an active household or personal goal/fund. SECURITY INVOKER: RLS still applies. created_by is auth.uid(). p_scope defaults to shared. Does not store current_amount.';

REVOKE ALL ON FUNCTION public.create_goal(uuid, text, numeric, public.goal_type, date, text, public.expense_scope) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_goal(uuid, text, numeric, public.goal_type, date, text, public.expense_scope) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. update_goal — p_scope
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_goal(uuid, text, numeric, public.goal_type, date, text);

CREATE OR REPLACE FUNCTION public.update_goal(
  p_goal_id uuid,
  p_name text,
  p_target_amount numeric,
  p_goal_type public.goal_type,
  p_target_date date,
  p_description text,
  p_scope public.expense_scope DEFAULT 'shared'
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
  v_scope public.expense_scope;
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

  IF p_scope IS NULL OR p_scope NOT IN ('personal', 'shared') THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;
  v_scope := p_scope;

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
    target_date = p_target_date,
    scope = v_scope
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

COMMENT ON FUNCTION public.update_goal(uuid, text, numeric, public.goal_type, date, text, public.expense_scope) IS
  'Updates a non-archived goal/fund including scope. SECURITY INVOKER: RLS still applies. Household comes from the row. Only the creator with an active membership may mutate.';

REVOKE ALL ON FUNCTION public.update_goal(uuid, text, numeric, public.goal_type, date, text, public.expense_scope) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_goal(uuid, text, numeric, public.goal_type, date, text, public.expense_scope) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. create_goal_contribution — personal funds/goals are owner-only
-- ---------------------------------------------------------------------------

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
  v_scope public.expense_scope;
  v_created_by uuid;
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

  SELECT household_id, status, scope, created_by
  INTO v_household_id, v_status, v_scope, v_created_by
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

  IF v_scope = 'personal' AND v_created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'nido.forbidden'
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
  'Creates a contribution to an active goal/fund. Shared: any active member. Personal: only the creator. SECURITY INVOKER. member_id and created_by are auth.uid(). Does not cap the sum at target_amount and does not mark the goal completed.';
