-- =============================================================================
-- Nido categories catalog + atomic create_expense
--
-- Phase 9.1.2A. Does not change existing RLS policies.
--
-- Why this migration:
--   1. categories has no way to mark household defaults.
--   2. create_household does not seed an expense catalog, so a new Nido
--      cannot register a gasto.
--   3. expenses + expense_splits cannot be inserted atomically from the
--      PostgREST client; split-sum and personal cardinality are application
--      transaction rules (see docs/database.md).
--
-- Reversible conceptually:
--   - is_default can stay; it is additive.
--   - create_household can be restored to the previous body.
--   - create_expense / default_expense_category_catalog can be dropped.
--   Default category rows are not deleted: expenses may already reference them
--   (category_id ON DELETE RESTRICT).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- categories.is_default
-- Distinguishes catalog rows seeded at household creation from user-created
-- categories. Archive remains the way to hide a category; do not hard-delete.
-- -----------------------------------------------------------------------------

ALTER TABLE public.categories
  ADD COLUMN is_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.categories.is_default IS
  'True when the row was seeded as a household default catalog category. User-created categories are false. Archive with archived_at; do not hard-delete rows used by expenses.';

-- -----------------------------------------------------------------------------
-- Default expense catalog (household-scoped, not global)
-- Names match the existing product list in src/lib/constants.ts EXP_CATS,
-- with truncated UI labels expanded (Entretenim. → Entretenimiento, Otra → Otros).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.default_expense_category_catalog()
RETURNS TABLE (name text, icon text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT *
  FROM (
    VALUES
      ('Vivienda', '🏠'),
      ('Despensa', '🛒'),
      ('Restaurantes', '🍔'),
      ('Transporte', '🚗'),
      ('Mascotas', '🐶'),
      ('Servicios', '⚡'),
      ('Limpieza', '🧹'),
      ('Entretenimiento', '🎬'),
      ('Salud', '❤️'),
      ('Educación', '🎓'),
      ('Trabajo', '💼'),
      ('Otros', '➕')
  ) AS catalog(name, icon);
$$;

COMMENT ON FUNCTION public.default_expense_category_catalog() IS
  'Canonical default expense category names and icons. Household-scoped rows are inserted from this list; there is no global categories table.';

REVOKE ALL ON FUNCTION public.default_expense_category_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_expense_category_catalog() TO authenticated;

-- -----------------------------------------------------------------------------
-- create_household
-- Same contract as 20260818000000 (p_name → households row). Also seeds
-- default expense categories in the same transaction so a failed catalog
-- insert cannot leave a household without categories.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_household(p_name text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.user_id = v_user_id
      AND hm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'nido.already_in_nido'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.households (name, created_by)
  VALUES (trim(p_name), v_user_id)
  RETURNING * INTO v_household;

  INSERT INTO public.household_members (
    household_id,
    user_id,
    role,
    left_at
  )
  VALUES (
    v_household.id,
    v_user_id,
    'owner',
    NULL
  );

  INSERT INTO public.categories (
    household_id,
    name,
    icon,
    type,
    created_by,
    is_default
  )
  SELECT
    v_household.id,
    catalog.name,
    catalog.icon,
    'expense',
    v_user_id,
    true
  FROM public.default_expense_category_catalog() AS catalog
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.categories AS existing
    WHERE existing.household_id = v_household.id
      AND existing.archived_at IS NULL
      AND existing.type = 'expense'
      AND lower(existing.name) = lower(catalog.name)
  );

  RETURN v_household;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'nido.already_in_nido'
      USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.create_household(text) IS
  'Creates a household, the caller''s owner membership, and default expense categories in one transaction. SECURITY INVOKER: RLS still applies. auth.uid() is the only user id used.';

-- -----------------------------------------------------------------------------
-- Backfill existing households that have no default expense catalog.
-- Uses households.created_by (profile FK, RESTRICT). Does not use service_role
-- from the application; this statement runs as the migrator.
-- -----------------------------------------------------------------------------

INSERT INTO public.categories (
  household_id,
  name,
  icon,
  type,
  created_by,
  is_default
)
SELECT
  h.id,
  catalog.name,
  catalog.icon,
  'expense',
  h.created_by,
  true
FROM public.households AS h
CROSS JOIN public.default_expense_category_catalog() AS catalog
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories AS existing
  WHERE existing.household_id = h.id
    AND existing.archived_at IS NULL
    AND existing.type = 'expense'
    AND lower(existing.name) = lower(catalog.name)
);

-- -----------------------------------------------------------------------------
-- create_expense
-- Atomic expense + splits. SECURITY INVOKER so existing RLS remains the
-- authorization authority. auth.uid() is created_by and must be an active
-- member (RLS + explicit check). Client-supplied household_id is not enough.
-- -----------------------------------------------------------------------------

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

  IF v_split_sum <> v_amount THEN
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
    v_distribution := 'fixed';
  ELSE
    IF v_split_count < 2 THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;
    v_distribution := 'equal';
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

  RETURN v_expense_id;
END;
$$;

COMMENT ON FUNCTION public.create_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) IS
  'Inserts a confirmed expense and its splits in one transaction. SECURITY INVOKER: RLS still applies. created_by and payer_id are auth.uid(). Split amounts must sum to the expense amount.';

REVOKE ALL ON FUNCTION public.create_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) TO authenticated;
