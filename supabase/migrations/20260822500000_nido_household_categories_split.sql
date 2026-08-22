-- Phase 9.4.1 — household name RPC, category CRUD RPCs, default_split_method,
-- and create_expense using the household preference for new shared expenses.
--
-- SECURITY INVOKER throughout. No service_role. No SECURITY DEFINER.
-- RPCs do not take a client-supplied household_id; they use the caller's
-- active membership. households UPDATE still goes through existing RLS.

-- ---------------------------------------------------------------------------
-- 1. Product split preference on households
-- ---------------------------------------------------------------------------

CREATE TYPE public.household_split_method AS ENUM (
  'equal',
  'proportional'
);

ALTER TABLE public.households
  ADD COLUMN default_split_method public.household_split_method NOT NULL DEFAULT 'equal';

COMMENT ON COLUMN public.households.default_split_method IS
  'Nido preference for new shared one-off expenses. equal → distribution_method equal. proportional → income_based from confirmed incomes in the current America/Mexico_City calendar month. Personal expenses ignore this column. Recurring materialization is unchanged.';

-- ---------------------------------------------------------------------------
-- 2. Active-household helper for name / split / category RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.active_household_id_for_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = auth.uid()
    AND left_at IS NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.active_household_id_for_user() IS
  'Returns the caller''s one active household, or null. SECURITY INVOKER; RLS still applies.';

REVOKE ALL ON FUNCTION public.active_household_id_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_household_id_for_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_household_name — only `name`
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_household_name(p_name text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_name text;
  v_row public.households;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  v_household_id := public.active_household_id_for_user();
  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.households
  SET name = v_name
  WHERE id = v_household_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.update_household_name(text) IS
  'Active member updates households.name only. SECURITY INVOKER. Household is the caller''s active Nido.';

REVOKE ALL ON FUNCTION public.update_household_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_household_name(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. update_household_default_split_method — only that column
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_household_default_split_method(
  p_method public.household_split_method
)
RETURNS public.households
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_row public.households;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('equal', 'proportional') THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  v_household_id := public.active_household_id_for_user();
  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.households
  SET default_split_method = p_method
  WHERE id = v_household_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.update_household_default_split_method(public.household_split_method) IS
  'Active member updates households.default_split_method only. SECURITY INVOKER. equal | proportional.';

REVOKE ALL ON FUNCTION public.update_household_default_split_method(public.household_split_method) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_household_default_split_method(public.household_split_method) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Category RPCs — create / rename / archive (no hard delete)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_category(
  p_name text,
  p_type public.category_type,
  p_icon text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_name text;
  v_icon text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  v_household_id := public.active_household_id_for_user();
  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  v_icon := nullif(trim(both FROM coalesce(p_icon, '')), '');

  BEGIN
    INSERT INTO public.categories (
      household_id,
      name,
      icon,
      type,
      created_by,
      is_default
    )
    VALUES (
      v_household_id,
      v_name,
      v_icon,
      p_type,
      v_user_id,
      false
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'nido.conflict'
        USING ERRCODE = 'P0001';
  END;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_category(text, public.category_type, text) IS
  'Creates a custom (is_default = false) category in the caller''s active Nido. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.create_category(text, public.category_type, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_category(text, public.category_type, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_category(
  p_category_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_name text;
  v_row public.categories;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  v_household_id := public.active_household_id_for_user();
  IF v_household_id IS NULL OR p_category_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_row
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND
     OR v_row.household_id IS DISTINCT FROM v_household_id
     OR v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    UPDATE public.categories
    SET name = v_name
    WHERE id = p_category_id
      AND household_id = v_household_id
      AND archived_at IS NULL;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'nido.conflict'
        USING ERRCODE = 'P0001';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_category_id;
END;
$$;

COMMENT ON FUNCTION public.rename_category(uuid, text) IS
  'Renames an active category in the caller''s Nido. Does not rewrite movements. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.rename_category(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_category(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_category(p_category_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_row public.categories;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  v_household_id := public.active_household_id_for_user();
  IF v_household_id IS NULL OR p_category_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_row
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND OR v_row.household_id IS DISTINCT FROM v_household_id THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_row.archived_at IS NOT NULL THEN
    RETURN p_category_id;
  END IF;

  UPDATE public.categories
  SET archived_at = now()
  WHERE id = p_category_id
    AND household_id = v_household_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_category_id;
END;
$$;

COMMENT ON FUNCTION public.archive_category(uuid) IS
  'Sets archived_at. Never DELETE. SECURITY INVOKER. Historical movements keep the FK.';

REVOKE ALL ON FUNCTION public.archive_category(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_category(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. create_expense — shared uses households.default_split_method
-- ---------------------------------------------------------------------------

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

  IF p_payer_id IS NULL OR p_payer_id <> v_user_id THEN
    RAISE EXCEPTION 'nido.forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_member_of(p_household_id, p_payer_id) THEN
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
  'Inserts a confirmed expense and its splits in one transaction. SECURITY INVOKER. Personal ignores households.default_split_method (fixed). Shared equal keeps client equal splits. Shared proportional recomputes from confirmed incomes of the current America/Mexico_City month and stores income_based. Recurring materialization is unchanged.';
