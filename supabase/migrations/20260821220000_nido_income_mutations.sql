-- Phase 9.1.3C — confirmed income create / update / soft-delete
--
-- Product rule:
--   auth.uid() → active household membership → incomes.household_id
--   → incomes.created_by = auth.uid()
--   → incomes.member_id = auth.uid()
--   → incomes.deleted_at IS NULL
--
-- Any active member may register an income attributed to themselves.
-- Only the creator may edit or soft-delete. Other members may SELECT.
-- Historical members and other households cannot mutate.
-- Already-deleted incomes cannot be mutated again.
--
-- Physical DELETE remains revoked. Soft-delete uses incomes.deleted_at
-- (column already exists; this migration does not add it).
-- Existing applied migrations are not modified.
--
-- Why this migration (not a schema invention):
--   1. incomes.category_id is NOT NULL and must be type = income in the
--      same household. create_household only seeded expense categories.
--   2. UPDATE RLS currently allows any active member; Gastos/Aportaciones
--      already require creator + live row.
--   3. PostgREST cannot express the validation/authorization contract as
--      a single client insert. create_income / update_income /
--      soft_delete_income are SECURITY INVOKER so existing RLS remains
--      the authority.

-- -----------------------------------------------------------------------------
-- Default income catalog (household-scoped, not global)
-- Names follow onboarding (Sueldo, Freelance) plus Extra / Otros.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.default_income_category_catalog()
RETURNS TABLE (name text, icon text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT *
  FROM (
    VALUES
      ('Sueldo', '💰'),
      ('Freelance', '💻'),
      ('Extra', '✨'),
      ('Otros', '➕')
  ) AS catalog(name, icon);
$$;

COMMENT ON FUNCTION public.default_income_category_catalog() IS
  'Canonical default income category names and icons. Household-scoped rows are inserted from this list; there is no global categories table.';

REVOKE ALL ON FUNCTION public.default_income_category_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_income_category_catalog() TO authenticated;

-- -----------------------------------------------------------------------------
-- create_household
-- Same contract as 20260821000000 (p_name → households row + expense
-- catalog). Also seeds default income categories in the same transaction.
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
    'income',
    v_user_id,
    true
  FROM public.default_income_category_catalog() AS catalog
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.categories AS existing
    WHERE existing.household_id = v_household.id
      AND existing.archived_at IS NULL
      AND existing.type = 'income'
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
  'Creates a household, the caller''s owner membership, and default expense and income categories in one transaction. SECURITY INVOKER: RLS still applies. auth.uid() is the only user id used.';

-- -----------------------------------------------------------------------------
-- Backfill existing households that have no default income catalog.
-- Uses households.created_by. Does not use service_role from the application.
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
  'income',
  h.created_by,
  true
FROM public.households AS h
CROSS JOIN public.default_income_category_catalog() AS catalog
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories AS existing
  WHERE existing.household_id = h.id
    AND existing.archived_at IS NULL
    AND existing.type = 'income'
    AND lower(existing.name) = lower(catalog.name)
);

-- -----------------------------------------------------------------------------
-- incomes INSERT: member_id is always the acting user.
-- The client cannot attribute an income to another member.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS incomes_insert_active_members ON public.incomes;

CREATE POLICY incomes_insert_active_members
  ON public.incomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND member_id = auth.uid()
    AND public.is_active_member_of(household_id, member_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- incomes UPDATE: creator + active member + not already deleted
-- WITH CHECK allows setting deleted_at (soft-delete) but keeps created_by
-- and member_id as auth.uid().
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS incomes_update_active_members ON public.incomes;
DROP POLICY IF EXISTS incomes_update_creator ON public.incomes;

CREATE POLICY incomes_update_creator
  ON public.incomes
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
    AND member_id = auth.uid()
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- create_income
-- SECURITY INVOKER: existing RLS remains the authorization authority.
-- created_by and member_id are auth.uid(). A client-supplied household_id
-- is not enough; the caller must be an active member of that Nido.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_income(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_at date
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
  v_income_id uuid;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
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

  INSERT INTO public.incomes (
    household_id,
    member_id,
    category_id,
    amount,
    description,
    occurred_at,
    created_by
  )
  VALUES (
    p_household_id,
    v_user_id,
    p_category_id,
    v_amount,
    v_description,
    p_occurred_at,
    v_user_id
  )
  RETURNING id INTO v_income_id;

  RETURN v_income_id;
END;
$$;

COMMENT ON FUNCTION public.create_income(uuid, uuid, numeric, text, date) IS
  'Inserts a confirmed one-time income. SECURITY INVOKER: RLS still applies. created_by and member_id are auth.uid(). A client-supplied household_id is not enough; the caller must be an active member.';

REVOKE ALL ON FUNCTION public.create_income(uuid, uuid, numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_income(uuid, uuid, numeric, text, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- update_income
-- Household is looked up from the row. Does not take household_id,
-- member_id, or created_by from the client.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_income(
  p_income_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_at date
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
  v_description text;
  v_category_household uuid;
  v_category_type public.category_type;
  v_category_archived timestamptz;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_income_id IS NULL THEN
    RAISE EXCEPTION 'nido.income_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, deleted_at
  INTO v_household_id, v_created_by, v_deleted_at
  FROM public.incomes
  WHERE id = p_income_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.income_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.income_deleted'
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

  UPDATE public.incomes
  SET
    category_id = p_category_id,
    amount = v_amount,
    description = v_description,
    occurred_at = p_occurred_at
  WHERE id = p_income_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.income_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_income_id;
END;
$$;

COMMENT ON FUNCTION public.update_income(uuid, uuid, numeric, text, date) IS
  'Updates a confirmed income. SECURITY INVOKER: RLS still applies. Household is resolved from the row. Only the creator with an active membership may mutate a non-deleted income.';

REVOKE ALL ON FUNCTION public.update_income(uuid, uuid, numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_income(uuid, uuid, numeric, text, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- soft_delete_income
-- Sets deleted_at. Does not physically delete the row.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_income(p_income_id uuid)
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

  IF p_income_id IS NULL THEN
    RAISE EXCEPTION 'nido.income_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, created_by, deleted_at
  INTO v_household_id, v_created_by, v_deleted_at
  FROM public.incomes
  WHERE id = p_income_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.income_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'nido.income_deleted'
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

  UPDATE public.incomes
  SET deleted_at = now()
  WHERE id = p_income_id
    AND deleted_at IS NULL
    AND created_by = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'nido.income_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_income_id;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_income(uuid) IS
  'Soft-deletes an income by setting deleted_at. SECURITY INVOKER: RLS still applies. The row is preserved. Only the creator with an active membership may delete a non-deleted income.';

REVOKE ALL ON FUNCTION public.soft_delete_income(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_income(uuid) TO authenticated;
