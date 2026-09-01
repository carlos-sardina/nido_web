-- Shared expenses may have no single payer.
--
-- Product: Registrar un gasto → Quién pagó → Todos los miembros. The expense
-- was settled at purchase, so nobody owes anyone for that row. Persisted as
-- expenses.payer_id NULL on scope = shared. Personal still requires a payer.
--
-- memberPaid then attributes each participant's net split instead of the
-- full net amount to one person. created_by stays auth.uid().

ALTER TABLE public.expenses
  ALTER COLUMN payer_id DROP NOT NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payer_required_unless_shared;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payer_required_unless_shared
  CHECK (payer_id IS NOT NULL OR scope = 'shared');

COMMENT ON COLUMN public.expenses.payer_id IS
  'The member who paid. NULL on a shared expense means every participant paid their share at the time; nobody owes anyone for this row. Personal expenses always have a payer.';

DROP POLICY IF EXISTS expenses_insert_active_members ON public.expenses;

CREATE POLICY expenses_insert_active_members
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND (
      (payer_id IS NULL AND scope = 'shared')
      OR public.is_active_member_of(household_id, payer_id)
    )
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE OR REPLACE FUNCTION public.create_expense(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_at date,
  p_payer_id uuid,
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
  v_expense_id uuid;
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
  v_preference public.household_split_method;
  v_use_client_splits boolean := true;
  v_today date;
  v_month_start date;
  v_month_end date;
  v_basis numeric(12, 2);
  v_bases numeric[] := ARRAY[]::numeric[];
  v_total_basis numeric(12, 2) := 0;
  v_total_cents integer;
  v_assigned_cents integer := 0;
  v_assigned_pct numeric(12, 4) := 0;
  v_cents integer;
  v_alloc_cents integer[] := ARRAY[]::integer[];
  v_amt numeric(12, 2);
  v_pct numeric(7, 4);
  v_i integer;
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

  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('personal', 'shared') THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  -- created_by stays auth.uid(). payer may be any active household member.
  -- NULL payer_id on shared means every participant paid their share now.
  IF p_payer_id IS NULL THEN
    IF p_scope IS DISTINCT FROM 'shared' THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF NOT public.is_active_member_of(p_household_id, p_payer_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
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
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
    END;

    IF v_member_id IS NULL THEN
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

    BEGIN
      IF v_split ? 'amount' AND v_split->>'amount' IS NOT NULL THEN
        v_split_amount := round((v_split->>'amount')::numeric, 2);
      ELSE
        v_split_amount := NULL;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
    END;

    IF v_split_amount IS NOT NULL THEN
      v_split_sum := v_split_sum + v_split_amount;
    END IF;

    v_seen := array_append(v_seen, v_member_id);
    v_split_count := v_split_count + 1;
  END LOOP;

  IF p_scope = 'personal' THEN
    IF v_split_count <> 1 OR v_seen[1] IS DISTINCT FROM p_payer_id THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_split_sum <> v_amount THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_has_percentage AND round(v_percentage_sum, 4) <> 100 THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    v_distribution := 'fixed';
    v_use_client_splits := true;
  ELSE
    IF v_split_count < 2 THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT default_split_method
    INTO v_preference
    FROM public.households
    WHERE id = p_household_id;

    IF v_preference IS NULL THEN
      v_preference := 'equal';
    END IF;

    IF v_preference = 'proportional' THEN
      v_today := (timezone('America/Mexico_City', now()))::date;
      v_month_start := date_trunc('month', v_today)::date;
      v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

      FOR v_i IN 1..v_split_count LOOP
        SELECT coalesce(sum(i.amount), 0)
        INTO v_basis
        FROM public.incomes AS i
        WHERE i.household_id = p_household_id
          AND i.member_id = v_seen[v_i]
          AND i.deleted_at IS NULL
          AND i.occurred_at >= v_month_start
          AND i.occurred_at <= v_month_end;

        v_bases := array_append(v_bases, v_basis);
        v_total_basis := v_total_basis + v_basis;
      END LOOP;

      IF v_total_basis <= 0 THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
      END IF;

      v_total_cents := round(v_amount * 100);
      v_assigned_cents := 0;

      FOR v_i IN 1..v_split_count LOOP
        IF v_i = v_split_count THEN
          v_cents := v_total_cents - v_assigned_cents;
        ELSE
          v_cents := round((v_bases[v_i] / v_total_basis) * v_total_cents);
          v_assigned_cents := v_assigned_cents + v_cents;
        END IF;
        v_alloc_cents := array_append(v_alloc_cents, v_cents);
      END LOOP;

      v_distribution := 'income_based';
      v_use_client_splits := false;
    ELSE
      IF v_split_sum <> v_amount THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
      END IF;
      IF v_has_percentage AND round(v_percentage_sum, 4) <> 100 THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
      END IF;
      v_distribution := 'equal';
      v_use_client_splits := true;
    END IF;
  END IF;

  IF v_use_client_splits THEN
    FOR v_split IN
      SELECT value FROM jsonb_array_elements(p_splits)
    LOOP
      BEGIN
        v_split_amount := round((v_split->>'amount')::numeric, 2);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'nido.invalid_split'
            USING ERRCODE = 'P0001';
      END;
      IF v_split_amount IS NULL OR v_split_amount <= 0 THEN
        RAISE EXCEPTION 'nido.invalid_split'
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.expenses (
    household_id,
    category_id,
    amount,
    description,
    occurred_at,
    payer_id,
    scope,
    distribution_method,
    created_by
  )
  VALUES (
    p_household_id,
    p_category_id,
    v_amount,
    v_description,
    p_occurred_at,
    p_payer_id,
    p_scope,
    v_distribution,
    v_user_id
  )
  RETURNING id INTO v_expense_id;

  IF v_use_client_splits THEN
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
        v_expense_id,
        (v_split->>'member_id')::uuid,
        round((v_split->>'amount')::numeric, 2),
        CASE
          WHEN v_split ? 'percentage' AND v_split->>'percentage' IS NOT NULL
            THEN (v_split->>'percentage')::numeric
          ELSE NULL
        END
      );
    END LOOP;
  ELSE
    v_assigned_pct := 0;
    FOR v_i IN 1..v_split_count LOOP
      v_amt := v_alloc_cents[v_i] / 100.0;
      IF v_i = v_split_count THEN
        v_pct := round((100 - v_assigned_pct)::numeric, 4);
      ELSE
        v_pct := round(((v_amt * 100) / v_amount)::numeric, 4);
        v_assigned_pct := v_assigned_pct + v_pct;
      END IF;

      INSERT INTO public.expense_splits (
        expense_id,
        member_id,
        amount,
        percentage
      )
      VALUES (
        v_expense_id,
        v_seen[v_i],
        v_amt,
        v_pct
      );
    END LOOP;
  END IF;

  RETURN v_expense_id;
END;
$$;


COMMENT ON FUNCTION public.create_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) IS
  'Inserts a confirmed expense and its splits in one transaction. SECURITY INVOKER. created_by is auth.uid(). payer_id may be any active household member, or NULL on a shared expense when every participant paid their share. Personal ignores households.default_split_method (fixed). Shared equal keeps client equal splits. Shared proportional recomputes from confirmed incomes of the current America/Mexico_City month and stores income_based.';

CREATE OR REPLACE FUNCTION public.update_expense(
  p_expense_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_at date,
  p_payer_id uuid,
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

  IF p_payer_id IS NULL THEN
    IF p_scope IS DISTINCT FROM 'shared' THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_payer_id IS DISTINCT FROM v_payer_id
     AND NOT public.is_active_member_of(v_household_id, p_payer_id) THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  v_payer_id := p_payer_id;

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
    IF v_payer_id IS NULL
       OR v_split_count <> 1
       OR v_seen[1] IS DISTINCT FROM v_payer_id THEN
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
    payer_id = v_payer_id,
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


COMMENT ON FUNCTION public.update_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) IS
  'Updates a confirmed expense, its payer, and replaces its splits in one transaction. SECURITY INVOKER. Only the creator with an active membership may mutate a non-deleted expense. payer_id may change to another active household member, or to NULL on a shared expense when every participant paid their share.';
