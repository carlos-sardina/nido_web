-- Phase 9.1.4 — confirmed budget create / update / soft-delete
--
-- Product rule:
--   auth.uid() → active household membership → budgets.household_id
--   → budgets.created_by = auth.uid()
--   → budgets.deleted_at IS NULL
--
-- Any active member may create a Nido-level budget (member_id NULL).
-- Only the creator may edit or soft-delete. Other members may SELECT.
-- Historical members and other households cannot mutate.
-- Already-deleted budgets cannot be mutated again.
--
-- Physical DELETE remains revoked. Soft-delete uses budgets.deleted_at.
-- Existing applied migrations are not modified.
--
-- Why this migration (not a schema invention of derived spend):
--   1. budgets has no deleted_at and no archive status. Physical DELETE
--      is not granted, so a live unique (household, category, member,
--      start_date) would block recreating the same planning row.
--   2. UPDATE RLS currently allows any active member; Gastos / Ingresos /
--      Aportaciones already require creator + live row.
--   3. Spent is still derived from expenses. This migration does not add
--      current_spent, remaining, or percentage_used.
--   4. PostgREST cannot express the validation/authorization contract as
--      a single client insert. create_budget / update_budget /
--      soft_delete_budget are SECURITY INVOKER so existing RLS remains
--      the authority.

-- -----------------------------------------------------------------------------
-- Soft-delete. Live uniqueness is only among non-deleted rows.
-- -----------------------------------------------------------------------------

ALTER TABLE public.budgets
  ADD COLUMN deleted_at timestamptz;

COMMENT ON COLUMN public.budgets.deleted_at IS
  'Soft-delete. NULL means the budget is live. Spent is never stored; deleted rows are excluded from planning totals.';

ALTER TABLE public.budgets
  DROP CONSTRAINT budgets_unique_scope;

CREATE UNIQUE INDEX budgets_unique_live_scope
  ON public.budgets (household_id, category_id, member_id, start_date)
  NULLS NOT DISTINCT
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Category on a budget must be an expense category of the same household.
-- Amount / date / deleted_at-only updates skip the household checks.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_budgets_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
    RETURN NEW;
  END IF;

  IF NEW.member_id IS NOT NULL THEN
    PERFORM public.assert_active_household_member(NEW.household_id, NEW.member_id);
  END IF;

  PERFORM public.assert_category_in_household(NEW.household_id, NEW.category_id, 'expense');
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- budgets UPDATE: creator + active member + not already deleted
-- WITH CHECK allows setting deleted_at (soft-delete) but keeps created_by.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS budgets_update_active_members ON public.budgets;
DROP POLICY IF EXISTS budgets_update_creator ON public.budgets;

CREATE POLICY budgets_update_creator
  ON public.budgets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- create_budget
-- SECURITY INVOKER: existing RLS remains the authorization authority.
-- created_by is auth.uid(). member_id is NULL (Nido-level). A client-supplied
-- household_id is not enough; the caller must be an active member of that Nido.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_budget(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_start_date date,
  p_end_date date
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
    NULL,
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

COMMENT ON FUNCTION public.create_budget(uuid, uuid, numeric, date, date) IS
  'Inserts a Nido-level monthly budget. SECURITY INVOKER: RLS still applies. created_by is auth.uid() and member_id is NULL. A client-supplied household_id is not enough; the caller must be an active member. Spent is not stored.';

REVOKE ALL ON FUNCTION public.create_budget(uuid, uuid, numeric, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_budget(uuid, uuid, numeric, date, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- update_budget
-- Household is looked up from the row. Does not take household_id,
-- member_id, or created_by from the client.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_budget(
  p_budget_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_start_date date,
  p_end_date date
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
  v_deleted_at timestamptz;
  v_amount numeric(12, 2);
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_month_start date;
  v_month_end date;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_budget_id IS NULL THEN
    RAISE EXCEPTION 'nido.budget_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, deleted_at
  INTO v_household_id, v_created_by, v_deleted_at
  FROM public.budgets
  WHERE id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.budget_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.budget_deleted'
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
     OR v_category_household IS DISTINCT FROM v_household_id
     OR v_category_type IS DISTINCT FROM 'expense'
     OR v_category_archived IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.budgets
  SET
    category_id = p_category_id,
    amount = v_amount,
    period = 'monthly',
    start_date = p_start_date,
    end_date = p_end_date
  WHERE id = p_budget_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.budget_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_budget_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'nido.conflict'
      USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.update_budget(uuid, uuid, numeric, date, date) IS
  'Updates a live Nido budget. SECURITY INVOKER: RLS still applies. Household is resolved from the row. Only the creator with an active membership may mutate a non-deleted budget. Spent is not stored.';

REVOKE ALL ON FUNCTION public.update_budget(uuid, uuid, numeric, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_budget(uuid, uuid, numeric, date, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- soft_delete_budget
-- Sets deleted_at. Does not physically delete the row.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_budget(p_budget_id uuid)
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
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_budget_id IS NULL THEN
    RAISE EXCEPTION 'nido.budget_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, deleted_at
  INTO v_household_id, v_created_by, v_deleted_at
  FROM public.budgets
  WHERE id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.budget_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.budget_deleted'
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

  UPDATE public.budgets
  SET deleted_at = now()
  WHERE id = p_budget_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.budget_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_budget_id;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_budget(uuid) IS
  'Soft-deletes a budget by setting deleted_at. SECURITY INVOKER: RLS still applies. The row is preserved. Only the creator with an active membership may delete a non-deleted budget.';

REVOKE ALL ON FUNCTION public.soft_delete_budget(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_budget(uuid) TO authenticated;
