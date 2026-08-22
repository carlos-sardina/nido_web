-- Phase 9.1.2B — expense update / soft-delete authorization
--
-- Product rule:
--   auth.uid() → active household membership → expense.household_id
--   → expense.created_by = auth.uid()
--
-- The creator may edit or soft-delete. Other members may SELECT.
-- Historical members and other households cannot mutate.
-- Already-deleted expenses cannot be mutated again.
--
-- Physical DELETE remains revoked. Soft-delete uses expenses.deleted_at.
-- Existing applied migrations are not modified.

-- -----------------------------------------------------------------------------
-- Read-only helper for split policies.
-- SECURITY DEFINER only to avoid nested expenses RLS, same pattern as
-- household_id_for_expense. It does not write and does not grant access
-- by itself; policies still require auth.uid() via created_by.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_mutate_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses AS e
    WHERE e.id = p_expense_id
      AND e.created_by = auth.uid()
      AND e.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.household_members AS hm
        WHERE hm.household_id = e.household_id
          AND hm.user_id = auth.uid()
          AND hm.left_at IS NULL
      )
  );
$$;

COMMENT ON FUNCTION public.can_mutate_expense(uuid) IS
  'True when the current user is an active member of the expense household, created the expense, and it is not soft-deleted. SECURITY DEFINER avoids nested expenses RLS when evaluating expense_splits policies.';

REVOKE ALL ON FUNCTION public.can_mutate_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_mutate_expense(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- expenses UPDATE: creator + active member + not already deleted
-- WITH CHECK allows setting deleted_at (soft-delete) but keeps created_by.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS expenses_update_active_members ON public.expenses;

CREATE POLICY expenses_update_creator
  ON public.expenses
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
-- expense_splits writes follow the parent expense mutation rule.
-- SELECT stays historical-member (unchanged).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS expense_splits_insert_active_members ON public.expense_splits;
DROP POLICY IF EXISTS expense_splits_update_active_members ON public.expense_splits;
DROP POLICY IF EXISTS expense_splits_delete_active_members ON public.expense_splits;

CREATE POLICY expense_splits_insert_creator
  ON public.expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_mutate_expense(expense_id)
    AND public.is_active_member_of(
      public.household_id_for_expense(expense_id),
      member_id
    )
  );

CREATE POLICY expense_splits_update_creator
  ON public.expense_splits
  FOR UPDATE
  TO authenticated
  USING (public.can_mutate_expense(expense_id))
  WITH CHECK (public.can_mutate_expense(expense_id));

CREATE POLICY expense_splits_delete_creator
  ON public.expense_splits
  FOR DELETE
  TO authenticated
  USING (public.can_mutate_expense(expense_id));

-- -----------------------------------------------------------------------------
-- update_expense
-- Replaces the expense and its splits in one transaction.
-- SECURITY INVOKER: existing RLS remains the authorization authority.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_expense(
  p_expense_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_at date,
  p_scope public.expense_scope,
  p_splits jsonb
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
  v_payer_id uuid;
  v_deleted_at timestamptz;
  v_amount numeric(12, 2);
  v_description text;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_split jsonb;
  v_member_id uuid;
  v_split_amount numeric(12, 2);
  v_percentage numeric(7, 4);
  v_split_sum numeric(12, 2) := 0;
  v_percentage_sum numeric(12, 4) := 0;
  v_split_count integer := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_has_percentage boolean := false;
  v_distribution public.distribution_method;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_expense_id IS NULL THEN
    RAISE EXCEPTION 'nido.expense_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, payer_id, deleted_at
  INTO v_household_id, v_created_by, v_payer_id, v_deleted_at
  FROM public.expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.expense_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.expense_deleted'
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

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' OR char_length(v_description) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_description'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('personal', 'shared') THEN
    RAISE EXCEPTION 'nido.invalid_split'
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

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_split IN
    SELECT value FROM jsonb_array_elements(p_splits)
  LOOP
    IF jsonb_typeof(v_split) <> 'object' THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      v_member_id := (v_split->>'member_id')::uuid;
      v_split_amount := round((v_split->>'amount')::numeric, 2);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
    END;

    IF v_member_id IS NULL OR v_split_amount IS NULL OR v_split_amount <= 0 THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_member_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.is_active_member_of(v_household_id, v_member_id) THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_split ? 'percentage' AND v_split->>'percentage' IS NOT NULL THEN
      BEGIN
        v_percentage := (v_split->>'percentage')::numeric;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'nido.invalid_split'
            USING ERRCODE = 'P0001';
      END;

      IF v_percentage IS NULL OR v_percentage < 0 OR v_percentage > 100 THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
      END IF;

      v_has_percentage := true;
      v_percentage_sum := v_percentage_sum + v_percentage;
    END IF;

    v_seen := array_append(v_seen, v_member_id);
    v_split_sum := v_split_sum + v_split_amount;
    v_split_count := v_split_count + 1;
  END LOOP;

  IF v_split_sum <> v_amount THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_has_percentage AND round(v_percentage_sum, 4) <> 100 THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_scope = 'personal' THEN
    IF v_split_count <> 1 OR v_seen[1] IS DISTINCT FROM v_payer_id THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    v_distribution := 'fixed';
  ELSE
    IF v_split_count < 2 THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    v_distribution := 'equal';
  END IF;

  UPDATE public.expenses
  SET
    category_id = p_category_id,
    amount = v_amount,
    description = v_description,
    occurred_at = p_occurred_at,
    scope = p_scope,
    distribution_method = v_distribution
  WHERE id = p_expense_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.expense_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.expense_splits
  WHERE expense_id = p_expense_id;

  FOR v_split IN
    SELECT value FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO public.expense_splits (
      expense_id,
      member_id,
      amount,
      percentage
    )
    VALUES (
      p_expense_id,
      (v_split->>'member_id')::uuid,
      round((v_split->>'amount')::numeric, 2),
      CASE
        WHEN v_split ? 'percentage' AND v_split->>'percentage' IS NOT NULL
          THEN (v_split->>'percentage')::numeric
        ELSE NULL
      END
    );
  END LOOP;

  RETURN p_expense_id;
END;
$$;

COMMENT ON FUNCTION public.update_expense(uuid, uuid, numeric, text, date, public.expense_scope, jsonb) IS
  'Updates a confirmed expense and replaces its splits in one transaction. SECURITY INVOKER: RLS still applies. Only the creator with an active membership may mutate a non-deleted expense.';

REVOKE ALL ON FUNCTION public.update_expense(uuid, uuid, numeric, text, date, public.expense_scope, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_expense(uuid, uuid, numeric, text, date, public.expense_scope, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- soft_delete_expense
-- Sets deleted_at. Does not delete expense_splits or activity history rows.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_expense(p_expense_id uuid)
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

  IF p_expense_id IS NULL THEN
    RAISE EXCEPTION 'nido.expense_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, deleted_at
  INTO v_household_id, v_created_by, v_deleted_at
  FROM public.expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.expense_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.expense_deleted'
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

  UPDATE public.expenses
  SET deleted_at = now()
  WHERE id = p_expense_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.expense_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_expense_id;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_expense(uuid) IS
  'Soft-deletes an expense by setting deleted_at. SECURITY INVOKER: RLS still applies. Splits are preserved. Only the creator with an active membership may delete a non-deleted expense.';

REVOKE ALL ON FUNCTION public.soft_delete_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_expense(uuid) TO authenticated;
