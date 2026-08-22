-- Phase 9.4.3 — global personal visibility + personal budgets as a
-- product path.
--
-- One profiles.personal_visibility applies to personal expenses,
-- personal budgets, and personal savings. Shared / Nido rows ignore it.
-- Default nido matches the previous open-member SELECT, so existing
-- households do not change until a user chooses Solo yo.
--
-- Authorization stays in RLS. React filters are presentation only.
-- SECURITY INVOKER RPCs. No service_role. The client never sends
-- another member's id. create_budget(p_personal) writes
-- member_id = auth.uid() or NULL.
--
-- personal_finance_visible is SECURITY DEFINER so policies can read
-- the owner's preference without requiring peers to SELECT profiles
-- columns. search_path is pinned. It does not grant household access
-- by itself; every policy still requires membership.

-- ---------------------------------------------------------------------------
-- 1. Enum + profiles column
-- ---------------------------------------------------------------------------

CREATE TYPE public.personal_visibility AS ENUM (
  'nido',
  'private'
);

ALTER TABLE public.profiles
  ADD COLUMN personal_visibility public.personal_visibility NOT NULL DEFAULT 'nido';

COMMENT ON COLUMN public.profiles.personal_visibility IS
  'Global preference for the owner''s personal expenses, personal budgets, and personal savings. nido = household peers may SELECT. private = only the owner. Shared/Nido rows ignore this column. Default nido matches the previous open SELECT.';

-- ---------------------------------------------------------------------------
-- 2. Visibility helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.personal_finance_visible(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_owner_id IS NOT NULL
     AND (
       p_owner_id = auth.uid()
       OR EXISTS (
         SELECT 1
         FROM public.profiles AS p
         WHERE p.id = p_owner_id
           AND p.personal_visibility = 'nido'
       )
     );
$$;

COMMENT ON FUNCTION public.personal_finance_visible(uuid) IS
  'True when auth.uid() may read p_owner_id''s personal finance rows. The owner always can. Peers can only when profiles.personal_visibility = nido. SECURITY DEFINER reads that column without requiring peers to SELECT it. Does not grant household access by itself; policies still require membership.';

REVOKE ALL ON FUNCTION public.personal_finance_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.personal_finance_visible(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. SELECT policies — personal rows honor visibility
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS expenses_select_members ON public.expenses;

CREATE POLICY expenses_select_members
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id)
    AND (
      scope = 'shared'
      OR public.personal_finance_visible(created_by)
    )
  );

DROP POLICY IF EXISTS expense_splits_select_members ON public.expense_splits;

CREATE POLICY expense_splits_select_members
  ON public.expense_splits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses AS e
      WHERE e.id = expense_id
    )
  );

DROP POLICY IF EXISTS budgets_select_members ON public.budgets;

CREATE POLICY budgets_select_members
  ON public.budgets
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id)
    AND (
      member_id IS NULL
      OR public.personal_finance_visible(member_id)
    )
  );

DROP POLICY IF EXISTS savings_balances_select_members ON public.savings_balances;

CREATE POLICY savings_balances_select_members
  ON public.savings_balances
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id)
    AND (
      member_id IS NULL
      OR public.personal_finance_visible(member_id)
    )
  );

-- Personal budgets may only be inserted for the caller. Onboarding already
-- writes member_id = auth.uid(). Nido rows stay member_id NULL.

DROP POLICY IF EXISTS budgets_insert_active_members ON public.budgets;

CREATE POLICY budgets_insert_active_members
  ON public.budgets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND (
      member_id IS NULL
      OR member_id = auth.uid()
    )
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- ---------------------------------------------------------------------------
-- 4. update_personal_visibility — self only, that column only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_personal_visibility(
  p_visibility public.personal_visibility
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('nido', 'private') THEN
    RAISE EXCEPTION 'nido.invalid_visibility'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET personal_visibility = p_visibility
  WHERE id = v_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.update_personal_visibility(public.personal_visibility) IS
  'Updates profiles.personal_visibility for auth.uid() only. SECURITY INVOKER. nido | private. Does not take a user id.';

REVOKE ALL ON FUNCTION public.update_personal_visibility(public.personal_visibility) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_personal_visibility(public.personal_visibility) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_budget — optional personal path (member_id = auth.uid())
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_budget(uuid, uuid, numeric, date, date);

CREATE OR REPLACE FUNCTION public.create_budget(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_start_date date,
  p_end_date date,
  p_personal boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(12, 2);
  v_budget_id uuid;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_month_start date;
  v_month_end date;
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_household_id IS NULL OR NOT public.is_active_household_member(p_household_id) THEN
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

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  v_month_start := date_trunc('month', p_start_date)::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  IF p_start_date <> v_month_start OR p_end_date <> v_month_end THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, type, archived_at
  INTO v_category_household, v_category_type, v_category_archived
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND
     OR v_category_household IS DISTINCT FROM p_household_id
     OR v_category_type IS DISTINCT FROM 'expense'
     OR v_category_archived IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(p_personal, false) THEN
    v_member_id := v_user_id;
  ELSE
    v_member_id := NULL;
  END IF;

  INSERT INTO public.budgets (
    household_id,
    member_id,
    category_id,
    amount,
    period,
    start_date,
    end_date,
    created_by
  )
  VALUES (
    p_household_id,
    v_member_id,
    p_category_id,
    v_amount,
    'monthly',
    p_start_date,
    p_end_date,
    v_user_id
  )
  RETURNING id INTO v_budget_id;

  RETURN v_budget_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'nido.conflict'
      USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.create_budget(uuid, uuid, numeric, date, date, boolean) IS
  'Inserts a monthly budget. SECURITY INVOKER: RLS still applies. created_by is auth.uid(). p_personal true → member_id = auth.uid(); false/default → Nido-level (member_id NULL). The client never supplies member_id.';

REVOKE ALL ON FUNCTION public.create_budget(uuid, uuid, numeric, date, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_budget(uuid, uuid, numeric, date, date, boolean) TO authenticated;
