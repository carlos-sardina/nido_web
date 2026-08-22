-- Phase 9.1.5 — recurring templates: creator-only writes, materialize, idempotency
--
-- Recurring rows are templates. They are not incomes or expenses.
-- Creating or editing a rule does not insert a financial movement.
-- The first movement exists only after an explicit materialize of next_occurrence.
--
-- Why this migration (not a schema invention):
--   1. There is no unique protection on (recurring_id, occurred_at). A frontend
--      `if (!existing) create()` cannot stop double-click, retry, or concurrent
--      materialize. The unique partial indexes are the real guarantee.
--   2. UPDATE RLS currently allows any active member. Gastos/Ingresos already
--      require creator + live membership. Recurrencias follow that product rule.
--   3. PostgREST cannot insert a rule + splits, or insert a movement + advance
--      next_occurrence, as one transaction. SECURITY INVOKER RPCs keep RLS as
--      the authorization authority.
--   4. docs/database.md already requires deactivating a leaving member's
--      recurring_incomes. leave_household did not do that.
--
-- No new tables. No new columns. No new frequencies.
-- Existing enum recurrence_frequency stays weekly / biweekly / monthly / yearly.
-- Soft-archive remains is_active = false. Physical DELETE stays revoked.
-- Existing applied migrations are not modified.
-- Compatible with current data: no live (recurring_id, occurred_at) pairs exist
-- as product materialization, so the unique indexes do not rewrite history.

-- -----------------------------------------------------------------------------
-- Idempotency: one live movement per rule per occurrence date
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX incomes_recurring_occurrence_live_idx
  ON public.incomes (recurring_id, occurred_at)
  WHERE recurring_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.incomes_recurring_occurrence_live_idx IS
  'Idempotency: a recurring income rule cannot produce two live incomes on the same occurred_at.';

CREATE UNIQUE INDEX expenses_recurring_occurrence_live_idx
  ON public.expenses (recurring_id, occurred_at)
  WHERE recurring_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.expenses_recurring_occurrence_live_idx IS
  'Idempotency: a recurring expense rule cannot produce two live expenses on the same occurred_at.';

-- -----------------------------------------------------------------------------
-- Calendar helpers. Dates are calendar dates, not UTC timestamps.
-- "Today" is America/Mexico_City, matching the dashboard period.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nido_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('America/Mexico_City', now()))::date;
$$;

COMMENT ON FUNCTION public.nido_today() IS
  'Current calendar date in America/Mexico_City. Used to decide whether next_occurrence is due.';

REVOKE ALL ON FUNCTION public.nido_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nido_today() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_recurrence_date(
  p_date date,
  p_frequency public.recurrence_frequency,
  p_day_of_month smallint DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_year integer;
  v_month integer;
  v_day integer;
  v_last integer;
BEGIN
  IF p_date IS NULL OR p_frequency IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_frequency = 'weekly' THEN
    RETURN p_date + 7;
  END IF;

  IF p_frequency = 'biweekly' THEN
    RETURN p_date + 14;
  END IF;

  IF p_frequency = 'monthly' THEN
    v_year := extract(year FROM p_date)::integer;
    v_month := extract(month FROM p_date)::integer + 1;
    IF v_month > 12 THEN
      v_month := 1;
      v_year := v_year + 1;
    END IF;
    v_day := coalesce(p_day_of_month, extract(day FROM p_date)::integer);
    v_last := extract(day FROM (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::integer;
    IF v_day < 1 THEN
      v_day := 1;
    END IF;
    IF v_day > v_last THEN
      v_day := v_last;
    END IF;
    RETURN make_date(v_year, v_month, v_day);
  END IF;

  v_year := extract(year FROM p_date)::integer + 1;
  v_month := extract(month FROM p_date)::integer;
  v_day := coalesce(p_day_of_month, extract(day FROM p_date)::integer);
  v_last := extract(day FROM (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::integer;
  IF v_day < 1 THEN
    v_day := 1;
  END IF;
  IF v_day > v_last THEN
    v_day := v_last;
  END IF;
  RETURN make_date(v_year, v_month, v_day);
END;
$$;

COMMENT ON FUNCTION public.next_recurrence_date(date, public.recurrence_frequency, smallint) IS
  'Advances a calendar date by weekly / biweekly / monthly / yearly. Monthly and yearly clamp to the last day of the target month. Optional day_of_month is the monthly hint from recurring_incomes.';

REVOKE ALL ON FUNCTION public.next_recurrence_date(date, public.recurrence_frequency, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_recurrence_date(date, public.recurrence_frequency, smallint) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Read-only helper for recurring_expense_splits policies.
-- SECURITY DEFINER only to avoid nested recurring_expenses RLS, same pattern
-- as can_mutate_expense. It does not write and does not grant access by itself.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_mutate_recurring_expense(p_recurring_expense_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recurring_expenses AS re
    WHERE re.id = p_recurring_expense_id
      AND re.created_by = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.household_members AS hm
        WHERE hm.household_id = re.household_id
          AND hm.user_id = auth.uid()
          AND hm.left_at IS NULL
      )
  );
$$;

COMMENT ON FUNCTION public.can_mutate_recurring_expense(uuid) IS
  'True when the current user is an active member of the rule household and created the recurring expense. SECURITY DEFINER avoids nested recurring_expenses RLS when evaluating split policies.';

REVOKE ALL ON FUNCTION public.can_mutate_recurring_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_mutate_recurring_expense(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS: creator + active member for template writes
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS recurring_incomes_insert_active_members ON public.recurring_incomes;
DROP POLICY IF EXISTS recurring_incomes_update_active_members ON public.recurring_incomes;
DROP POLICY IF EXISTS recurring_incomes_update_creator ON public.recurring_incomes;

CREATE POLICY recurring_incomes_insert_active_members
  ON public.recurring_incomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND member_id = auth.uid()
    AND public.is_active_member_of(household_id, member_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY recurring_incomes_update_creator
  ON public.recurring_incomes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND member_id = auth.uid()
    AND public.category_belongs_to_household(category_id, household_id)
  );

DROP POLICY IF EXISTS recurring_expenses_insert_active_members ON public.recurring_expenses;
DROP POLICY IF EXISTS recurring_expenses_update_active_members ON public.recurring_expenses;
DROP POLICY IF EXISTS recurring_expenses_update_creator ON public.recurring_expenses;

CREATE POLICY recurring_expenses_insert_active_members
  ON public.recurring_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND payer_id = auth.uid()
    AND public.is_active_member_of(household_id, payer_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY recurring_expenses_update_creator
  ON public.recurring_expenses
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND payer_id = auth.uid()
    AND public.category_belongs_to_household(category_id, household_id)
  );

DROP POLICY IF EXISTS recurring_expense_splits_insert_active_members ON public.recurring_expense_splits;
DROP POLICY IF EXISTS recurring_expense_splits_update_active_members ON public.recurring_expense_splits;
DROP POLICY IF EXISTS recurring_expense_splits_delete_active_members ON public.recurring_expense_splits;

CREATE POLICY recurring_expense_splits_insert_creator
  ON public.recurring_expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_mutate_recurring_expense(recurring_expense_id)
    AND public.is_active_member_of(
      public.household_id_for_recurring_expense(recurring_expense_id),
      member_id
    )
  );

CREATE POLICY recurring_expense_splits_update_creator
  ON public.recurring_expense_splits
  FOR UPDATE
  TO authenticated
  USING (public.can_mutate_recurring_expense(recurring_expense_id))
  WITH CHECK (public.can_mutate_recurring_expense(recurring_expense_id));

CREATE POLICY recurring_expense_splits_delete_creator
  ON public.recurring_expense_splits
  FOR DELETE
  TO authenticated
  USING (public.can_mutate_recurring_expense(recurring_expense_id));

-- -----------------------------------------------------------------------------
-- leave_household: deactivate the leaving member's recurring incomes
-- Does not delete movements or recurring_expense_splits.
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

  UPDATE public.recurring_incomes
  SET is_active = false
  WHERE household_id = v_membership.household_id
    AND member_id = v_user_id
    AND is_active = true;

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
  'Sets left_at on the caller''s active membership. Deactivates that member''s recurring_incomes in the Nido they left. Does not delete movements, recurring expenses, or splits. The last active owner cannot leave.';

-- -----------------------------------------------------------------------------
-- Shared validation helpers used by the recurrence RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_recurrence_frequency(
  p_frequency public.recurrence_frequency
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_frequency IS NULL
     OR p_frequency NOT IN ('weekly', 'biweekly', 'monthly', 'yearly') THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_recurrence_frequency(public.recurrence_frequency) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_recurrence_frequency(public.recurrence_frequency) TO authenticated;

-- -----------------------------------------------------------------------------
-- create_recurring_income
-- Template only. Does not insert incomes.
-- next_occurrence starts at start_date. First movement requires materialize.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_recurring_income(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_start_date date,
  p_frequency public.recurrence_frequency,
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
  v_description text;
  v_id uuid;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_day_of_month smallint;
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

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' OR char_length(v_description) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_description'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_recurrence_frequency(p_frequency);

  SELECT household_id, type, archived_at
  INTO v_category_household, v_category_type, v_category_archived
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND
     OR v_category_household IS DISTINCT FROM p_household_id
     OR v_category_type IS DISTINCT FROM 'income'
     OR v_category_archived IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_frequency = 'monthly' THEN
    v_day_of_month := extract(day FROM p_start_date)::smallint;
  ELSE
    v_day_of_month := NULL;
  END IF;

  INSERT INTO public.recurring_incomes (
    household_id,
    member_id,
    category_id,
    amount,
    description,
    frequency,
    day_of_month,
    start_date,
    end_date,
    next_occurrence,
    is_active,
    created_by
  )
  VALUES (
    p_household_id,
    v_user_id,
    p_category_id,
    v_amount,
    v_description,
    p_frequency,
    v_day_of_month,
    p_start_date,
    p_end_date,
    p_start_date,
    true,
    v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recurring_income(uuid, uuid, numeric, text, date, public.recurrence_frequency, date) IS
  'Inserts an income template. Does not insert incomes. SECURITY INVOKER. created_by and member_id are auth.uid(). next_occurrence starts at start_date.';

REVOKE ALL ON FUNCTION public.create_recurring_income(uuid, uuid, numeric, text, date, public.recurrence_frequency, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recurring_income(uuid, uuid, numeric, text, date, public.recurrence_frequency, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- update_recurring_income
-- Does not change household, member, created_by, start_date, or next_occurrence.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_recurring_income(
  p_recurring_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_frequency public.recurrence_frequency,
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
  v_start_date date;
  v_amount numeric(12, 2);
  v_description text;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_day_of_month smallint;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recurring_id IS NULL THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, start_date
  INTO v_household_id, v_created_by, v_start_date
  FROM public.recurring_incomes
  WHERE id = p_recurring_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
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

  PERFORM public.assert_recurrence_frequency(p_frequency);

  IF p_end_date IS NOT NULL AND p_end_date < v_start_date THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, type, archived_at
  INTO v_category_household, v_category_type, v_category_archived
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND
     OR v_category_household IS DISTINCT FROM v_household_id
     OR v_category_type IS DISTINCT FROM 'income'
     OR v_category_archived IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_frequency = 'monthly' THEN
    v_day_of_month := extract(day FROM v_start_date)::smallint;
  ELSE
    v_day_of_month := NULL;
  END IF;

  UPDATE public.recurring_incomes
  SET
    category_id = p_category_id,
    amount = v_amount,
    description = v_description,
    frequency = p_frequency,
    day_of_month = v_day_of_month,
    end_date = p_end_date
  WHERE id = p_recurring_id
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_recurring_id;
END;
$$;

COMMENT ON FUNCTION public.update_recurring_income(uuid, uuid, numeric, text, public.recurrence_frequency, date) IS
  'Updates an income template. Does not insert or rewrite incomes. Household and next_occurrence are not taken from the client.';

REVOKE ALL ON FUNCTION public.update_recurring_income(uuid, uuid, numeric, text, public.recurrence_frequency, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_recurring_income(uuid, uuid, numeric, text, public.recurrence_frequency, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- set_recurring_income_active
-- Pause / reactivate. Does not delete materialized incomes.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_recurring_income_active(
  p_recurring_id uuid,
  p_is_active boolean
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
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recurring_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by
  INTO v_household_id, v_created_by
  FROM public.recurring_incomes
  WHERE id = p_recurring_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
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

  UPDATE public.recurring_incomes
  SET is_active = p_is_active
  WHERE id = p_recurring_id
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_recurring_id;
END;
$$;

COMMENT ON FUNCTION public.set_recurring_income_active(uuid, boolean) IS
  'Pauses or reactivates an income template. Does not delete or duplicate materialized incomes.';

REVOKE ALL ON FUNCTION public.set_recurring_income_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_recurring_income_active(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- materialize_recurring_income
-- Inserts one incomes row for the requested occurrence and advances the cursor
-- only when that occurrence is the current next_occurrence.
-- Idempotent: the same rule + date returns the existing live income.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.materialize_recurring_income(
  p_recurring_id uuid,
  p_occurred_at date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rule public.recurring_incomes;
  v_existing uuid;
  v_income_id uuid;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_today date := public.nido_today();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recurring_id IS NULL OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_rule
  FROM public.recurring_incomes
  WHERE id = p_recurring_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_rule.created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_household_member(v_rule.household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_existing
  FROM public.incomes
  WHERE recurring_id = p_recurring_id
    AND occurred_at = p_occurred_at
    AND deleted_at IS NULL;

  IF v_existing IS NOT NULL THEN
    IF v_rule.next_occurrence = p_occurred_at THEN
      UPDATE public.recurring_incomes
      SET next_occurrence = public.next_recurrence_date(
        v_rule.next_occurrence,
        v_rule.frequency,
        v_rule.day_of_month
      )
      WHERE id = p_recurring_id
        AND next_occurrence = p_occurred_at;
    END IF;
    RETURN v_existing;
  END IF;

  IF p_occurred_at IS DISTINCT FROM v_rule.next_occurrence THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_rule.is_active THEN
    RAISE EXCEPTION 'nido.recurrence_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_rule.end_date IS NOT NULL AND p_occurred_at > v_rule.end_date THEN
    RAISE EXCEPTION 'nido.recurrence_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_occurred_at > v_today THEN
    RAISE EXCEPTION 'nido.recurrence_not_due'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_member_of(v_rule.household_id, v_rule.member_id) THEN
    RAISE EXCEPTION 'nido.recurrence_requires_review'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, type, archived_at
  INTO v_category_household, v_category_type, v_category_archived
  FROM public.categories
  WHERE id = v_rule.category_id;

  IF NOT FOUND
     OR v_category_household IS DISTINCT FROM v_rule.household_id
     OR v_category_type IS DISTINCT FROM 'income'
     OR v_category_archived IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.incomes (
      household_id,
      member_id,
      category_id,
      amount,
      description,
      occurred_at,
      recurring_id,
      created_by
    )
    VALUES (
      v_rule.household_id,
      v_user_id,
      v_rule.category_id,
      v_rule.amount,
      v_rule.description,
      p_occurred_at,
      p_recurring_id,
      v_user_id
    )
    RETURNING id INTO v_income_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id
      INTO v_existing
      FROM public.incomes
      WHERE recurring_id = p_recurring_id
        AND occurred_at = p_occurred_at
        AND deleted_at IS NULL;
      IF v_existing IS NULL THEN
        RAISE EXCEPTION 'nido.conflict'
          USING ERRCODE = 'P0001';
      END IF;
      v_income_id := v_existing;
  END;

  UPDATE public.recurring_incomes
  SET next_occurrence = public.next_recurrence_date(
    v_rule.next_occurrence,
    v_rule.frequency,
    v_rule.day_of_month
  )
  WHERE id = p_recurring_id
    AND next_occurrence = p_occurred_at;

  RETURN v_income_id;
END;
$$;

COMMENT ON FUNCTION public.materialize_recurring_income(uuid, date) IS
  'Confirms one due income occurrence. SECURITY INVOKER. Unique (recurring_id, occurred_at) plus FOR UPDATE make the same period idempotent. Does not generate a historical series.';

REVOKE ALL ON FUNCTION public.materialize_recurring_income(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_income(uuid, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- Recurring expense split validation (same contract as create_expense)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_recurring_expense_splits(
  p_household_id uuid,
  p_payer_id uuid,
  p_amount numeric,
  p_scope public.expense_scope,
  p_splits jsonb,
  OUT o_distribution public.distribution_method
)
RETURNS public.distribution_method
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_split jsonb;
  v_member_id uuid;
  v_split_amount numeric(12, 2);
  v_percentage numeric(7, 4);
  v_split_sum numeric(12, 2) := 0;
  v_percentage_sum numeric(12, 4) := 0;
  v_split_count integer := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_has_percentage boolean := false;
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('personal', 'shared') THEN
    RAISE EXCEPTION 'nido.invalid_split'
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

    IF NOT public.is_active_member_of(p_household_id, v_member_id) THEN
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

  IF v_split_sum <> p_amount THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_has_percentage AND round(v_percentage_sum, 4) <> 100 THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_scope = 'personal' THEN
    IF v_split_count <> 1 OR v_seen[1] IS DISTINCT FROM p_payer_id THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    o_distribution := 'fixed';
  ELSE
    IF v_split_count < 2 THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    o_distribution := 'equal';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.validate_recurring_expense_splits(uuid, uuid, numeric, public.expense_scope, jsonb) IS
  'Validates planned splits for a recurring expense template. Personal → fixed; shared → equal. Same sum and membership rules as create_expense.';

REVOKE ALL ON FUNCTION public.validate_recurring_expense_splits(uuid, uuid, numeric, public.expense_scope, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_recurring_expense_splits(uuid, uuid, numeric, public.expense_scope, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- create_recurring_expense
-- Template + planned splits. Does not insert expenses.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_recurring_expense(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_start_date date,
  p_frequency public.recurrence_frequency,
  p_end_date date,
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
  v_amount numeric(12, 2);
  v_description text;
  v_id uuid;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_distribution public.distribution_method;
  v_split jsonb;
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

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' OR char_length(v_description) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_description'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_recurrence_frequency(p_frequency);

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

  v_distribution := public.validate_recurring_expense_splits(
    p_household_id,
    v_user_id,
    v_amount,
    p_scope,
    p_splits
  );

  INSERT INTO public.recurring_expenses (
    household_id,
    category_id,
    amount,
    description,
    payer_id,
    scope,
    distribution_method,
    frequency,
    start_date,
    end_date,
    next_occurrence,
    is_active,
    created_by
  )
  VALUES (
    p_household_id,
    p_category_id,
    v_amount,
    v_description,
    v_user_id,
    p_scope,
    v_distribution,
    p_frequency,
    p_start_date,
    p_end_date,
    p_start_date,
    true,
    v_user_id
  )
  RETURNING id INTO v_id;

  FOR v_split IN
    SELECT value FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO public.recurring_expense_splits (
      recurring_expense_id,
      member_id,
      amount,
      percentage
    )
    VALUES (
      v_id,
      (v_split->>'member_id')::uuid,
      round((v_split->>'amount')::numeric, 2),
      CASE
        WHEN v_split ? 'percentage' AND v_split->>'percentage' IS NOT NULL
          THEN (v_split->>'percentage')::numeric
        ELSE NULL
      END
    );
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recurring_expense(uuid, uuid, numeric, text, date, public.recurrence_frequency, date, public.expense_scope, jsonb) IS
  'Inserts an expense template and its planned splits. Does not insert expenses. SECURITY INVOKER. created_by and payer_id are auth.uid().';

REVOKE ALL ON FUNCTION public.create_recurring_expense(uuid, uuid, numeric, text, date, public.recurrence_frequency, date, public.expense_scope, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recurring_expense(uuid, uuid, numeric, text, date, public.recurrence_frequency, date, public.expense_scope, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- update_recurring_expense
-- Replaces planned splits. Does not rewrite materialized expenses.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_recurring_expense(
  p_recurring_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_frequency public.recurrence_frequency,
  p_end_date date,
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
  v_start_date date;
  v_amount numeric(12, 2);
  v_description text;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_distribution public.distribution_method;
  v_split jsonb;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recurring_id IS NULL THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, start_date
  INTO v_household_id, v_created_by, v_start_date
  FROM public.recurring_expenses
  WHERE id = p_recurring_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
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

  PERFORM public.assert_recurrence_frequency(p_frequency);

  IF p_end_date IS NOT NULL AND p_end_date < v_start_date THEN
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

  v_distribution := public.validate_recurring_expense_splits(
    v_household_id,
    v_user_id,
    v_amount,
    p_scope,
    p_splits
  );

  UPDATE public.recurring_expenses
  SET
    category_id = p_category_id,
    amount = v_amount,
    description = v_description,
    frequency = p_frequency,
    end_date = p_end_date,
    scope = p_scope,
    distribution_method = v_distribution
  WHERE id = p_recurring_id
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.recurring_expense_splits
  WHERE recurring_expense_id = p_recurring_id;

  FOR v_split IN
    SELECT value FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO public.recurring_expense_splits (
      recurring_expense_id,
      member_id,
      amount,
      percentage
    )
    VALUES (
      p_recurring_id,
      (v_split->>'member_id')::uuid,
      round((v_split->>'amount')::numeric, 2),
      CASE
        WHEN v_split ? 'percentage' AND v_split->>'percentage' IS NOT NULL
          THEN (v_split->>'percentage')::numeric
        ELSE NULL
      END
    );
  END LOOP;

  RETURN p_recurring_id;
END;
$$;

COMMENT ON FUNCTION public.update_recurring_expense(uuid, uuid, numeric, text, public.recurrence_frequency, date, public.expense_scope, jsonb) IS
  'Updates an expense template and replaces planned splits. Does not rewrite materialized expenses.';

REVOKE ALL ON FUNCTION public.update_recurring_expense(uuid, uuid, numeric, text, public.recurrence_frequency, date, public.expense_scope, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_recurring_expense(uuid, uuid, numeric, text, public.recurrence_frequency, date, public.expense_scope, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_recurring_expense_active(
  p_recurring_id uuid,
  p_is_active boolean
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
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recurring_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by
  INTO v_household_id, v_created_by
  FROM public.recurring_expenses
  WHERE id = p_recurring_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
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

  UPDATE public.recurring_expenses
  SET is_active = p_is_active
  WHERE id = p_recurring_id
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_recurring_id;
END;
$$;

COMMENT ON FUNCTION public.set_recurring_expense_active(uuid, boolean) IS
  'Pauses or reactivates an expense template. Does not delete or duplicate materialized expenses.';

REVOKE ALL ON FUNCTION public.set_recurring_expense_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_recurring_expense_active(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- materialize_recurring_expense
-- Builds the occurrence splits at confirm time. income_based is recalculated
-- from current active recurring incomes. Fails closed if a participant/payer
-- has left or income_based is invalid.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.materialize_recurring_expense(
  p_recurring_id uuid,
  p_occurred_at date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rule public.recurring_expenses;
  v_existing uuid;
  v_expense_id uuid;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_today date := public.nido_today();
  v_split record;
  v_member_ids uuid[] := ARRAY[]::uuid[];
  v_total_cents integer;
  v_base integer;
  v_remainder integer;
  v_i integer;
  v_cents integer;
  v_amt numeric(12, 2);
  v_assigned_pct numeric(12, 4) := 0;
  v_pct numeric(7, 4);
  v_count integer;
  v_basis numeric(12, 2);
  v_total_basis numeric(12, 2) := 0;
  v_bases numeric(12, 2)[] := ARRAY[]::numeric[];
  v_alloc_cents integer[] := ARRAY[]::integer[];
  v_assigned_cents integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recurring_id IS NULL OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_rule
  FROM public.recurring_expenses
  WHERE id = p_recurring_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.recurrence_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_rule.created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_household_member(v_rule.household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_existing
  FROM public.expenses
  WHERE recurring_id = p_recurring_id
    AND occurred_at = p_occurred_at
    AND deleted_at IS NULL;

  IF v_existing IS NOT NULL THEN
    IF v_rule.next_occurrence = p_occurred_at THEN
      UPDATE public.recurring_expenses
      SET next_occurrence = public.next_recurrence_date(
        v_rule.next_occurrence,
        v_rule.frequency,
        NULL
      )
      WHERE id = p_recurring_id
        AND next_occurrence = p_occurred_at;
    END IF;
    RETURN v_existing;
  END IF;

  IF p_occurred_at IS DISTINCT FROM v_rule.next_occurrence THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_rule.is_active THEN
    RAISE EXCEPTION 'nido.recurrence_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_rule.end_date IS NOT NULL AND p_occurred_at > v_rule.end_date THEN
    RAISE EXCEPTION 'nido.recurrence_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_occurred_at > v_today THEN
    RAISE EXCEPTION 'nido.recurrence_not_due'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_member_of(v_rule.household_id, v_rule.payer_id) THEN
    RAISE EXCEPTION 'nido.recurrence_requires_review'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, type, archived_at
  INTO v_category_household, v_category_type, v_category_archived
  FROM public.categories
  WHERE id = v_rule.category_id;

  IF NOT FOUND
     OR v_category_household IS DISTINCT FROM v_rule.household_id
     OR v_category_type IS DISTINCT FROM 'expense'
     OR v_category_archived IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_split IN
    SELECT member_id, amount, percentage
    FROM public.recurring_expense_splits
    WHERE recurring_expense_id = p_recurring_id
    ORDER BY member_id
  LOOP
    IF NOT public.is_active_member_of(v_rule.household_id, v_split.member_id) THEN
      RAISE EXCEPTION 'nido.recurrence_requires_review'
        USING ERRCODE = 'P0001';
    END IF;
    v_member_ids := array_append(v_member_ids, v_split.member_id);
  END LOOP;

  IF v_rule.scope = 'personal' THEN
    IF cardinality(v_member_ids) <> 1 OR v_member_ids[1] IS DISTINCT FROM v_rule.payer_id THEN
      RAISE EXCEPTION 'nido.recurrence_requires_review'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF cardinality(v_member_ids) < 2 THEN
    RAISE EXCEPTION 'nido.recurrence_requires_review'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.expenses (
      household_id,
      category_id,
      amount,
      description,
      occurred_at,
      payer_id,
      scope,
      distribution_method,
      recurring_id,
      created_by
    )
    VALUES (
      v_rule.household_id,
      v_rule.category_id,
      v_rule.amount,
      v_rule.description,
      p_occurred_at,
      v_rule.payer_id,
      v_rule.scope,
      CASE
        WHEN v_rule.scope = 'personal' THEN 'fixed'::public.distribution_method
        WHEN v_rule.distribution_method = 'income_based' THEN 'income_based'::public.distribution_method
        WHEN v_rule.distribution_method = 'percentage' THEN 'percentage'::public.distribution_method
        WHEN v_rule.distribution_method = 'fixed' THEN 'fixed'::public.distribution_method
        ELSE 'equal'::public.distribution_method
      END,
      p_recurring_id,
      v_user_id
    )
    RETURNING id INTO v_expense_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id
      INTO v_existing
      FROM public.expenses
      WHERE recurring_id = p_recurring_id
        AND occurred_at = p_occurred_at
        AND deleted_at IS NULL;
      IF v_existing IS NULL THEN
        RAISE EXCEPTION 'nido.conflict'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.recurring_expenses
      SET next_occurrence = public.next_recurrence_date(
        v_rule.next_occurrence,
        v_rule.frequency,
        NULL
      )
      WHERE id = p_recurring_id
        AND next_occurrence = p_occurred_at;

      RETURN v_existing;
  END;

  IF v_rule.scope = 'personal' OR v_rule.distribution_method = 'equal' THEN
    v_count := cardinality(v_member_ids);
    v_total_cents := round(v_rule.amount * 100);
    v_base := v_total_cents / v_count;
    v_remainder := v_total_cents - v_base * v_count;
    v_assigned_pct := 0;

    FOR v_i IN 1..v_count LOOP
      v_cents := v_base + CASE WHEN v_i <= v_remainder THEN 1 ELSE 0 END;
      v_amt := v_cents / 100.0;
      IF v_i = v_count THEN
        v_pct := round((100 - v_assigned_pct)::numeric, 4);
      ELSE
        v_pct := round(((v_amt * 100) / v_rule.amount)::numeric, 4);
        v_assigned_pct := v_assigned_pct + v_pct;
      END IF;

      INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
      VALUES (v_expense_id, v_member_ids[v_i], v_amt, v_pct);
    END LOOP;
  ELSIF v_rule.distribution_method = 'income_based' THEN
    FOR v_i IN 1..cardinality(v_member_ids) LOOP
      SELECT coalesce(sum(ri.amount), 0)
      INTO v_basis
      FROM public.recurring_incomes AS ri
      WHERE ri.household_id = v_rule.household_id
        AND ri.member_id = v_member_ids[v_i]
        AND ri.is_active
        AND (ri.end_date IS NULL OR ri.end_date >= p_occurred_at);

      v_bases := array_append(v_bases, v_basis);
      v_total_basis := v_total_basis + v_basis;
    END LOOP;

    IF v_total_basis <= 0 THEN
      RAISE EXCEPTION 'nido.recurrence_requires_review'
        USING ERRCODE = 'P0001';
    END IF;

    v_total_cents := round(v_rule.amount * 100);
    v_assigned_cents := 0;
    v_assigned_pct := 0;

    FOR v_i IN 1..cardinality(v_member_ids) LOOP
      IF v_i = cardinality(v_member_ids) THEN
        v_cents := v_total_cents - v_assigned_cents;
      ELSE
        v_cents := round((v_bases[v_i] / v_total_basis) * v_total_cents);
        v_assigned_cents := v_assigned_cents + v_cents;
      END IF;
      v_alloc_cents := array_append(v_alloc_cents, v_cents);
    END LOOP;

    FOR v_i IN 1..cardinality(v_member_ids) LOOP
      v_amt := v_alloc_cents[v_i] / 100.0;
      IF v_i = cardinality(v_member_ids) THEN
        v_pct := round((100 - v_assigned_pct)::numeric, 4);
      ELSE
        v_pct := round(((v_amt * 100) / v_rule.amount)::numeric, 4);
        v_assigned_pct := v_assigned_pct + v_pct;
      END IF;

      INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
      VALUES (v_expense_id, v_member_ids[v_i], v_amt, v_pct);
    END LOOP;
  ELSE
    -- percentage or fixed planned shares: re-validate against the current amount
    SELECT coalesce(sum(amount), 0)
    INTO v_basis
    FROM public.recurring_expense_splits
    WHERE recurring_expense_id = p_recurring_id;

    IF v_rule.distribution_method = 'fixed' AND v_basis <> v_rule.amount THEN
      RAISE EXCEPTION 'nido.recurrence_requires_review'
        USING ERRCODE = 'P0001';
    END IF;

    FOR v_split IN
      SELECT member_id, amount, percentage
      FROM public.recurring_expense_splits
      WHERE recurring_expense_id = p_recurring_id
      ORDER BY member_id
    LOOP
      IF v_rule.distribution_method = 'percentage' THEN
        IF v_split.percentage IS NULL THEN
          RAISE EXCEPTION 'nido.recurrence_requires_review'
            USING ERRCODE = 'P0001';
        END IF;
        v_amt := round(v_rule.amount * v_split.percentage / 100, 2);
        INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
        VALUES (v_expense_id, v_split.member_id, v_amt, v_split.percentage);
      ELSE
        INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
        VALUES (v_expense_id, v_split.member_id, v_split.amount, v_split.percentage);
      END IF;
    END LOOP;

    SELECT coalesce(sum(amount), 0)
    INTO v_basis
    FROM public.expense_splits
    WHERE expense_id = v_expense_id;

    IF v_basis <> v_rule.amount THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.recurring_expenses
  SET next_occurrence = public.next_recurrence_date(
    v_rule.next_occurrence,
    v_rule.frequency,
    NULL
  )
  WHERE id = p_recurring_id
    AND next_occurrence = p_occurred_at;

  RETURN v_expense_id;
END;
$$;

COMMENT ON FUNCTION public.materialize_recurring_expense(uuid, date) IS
  'Confirms one due expense occurrence and its splits. SECURITY INVOKER. Unique (recurring_id, occurred_at) plus FOR UPDATE make the same period idempotent. Fails closed when the payer, a participant, or income_based is unsafe. Does not generate a historical series.';

REVOKE ALL ON FUNCTION public.materialize_recurring_expense(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_expense(uuid, date) TO authenticated;
