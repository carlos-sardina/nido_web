-- Income catalog is Sueldo + Extra only. Custom income categories are closed.
-- Extra is a one-time event; recurring income cannot use Extra.

-- ---------------------------------------------------------------------------
-- 1. Canonical catalog
-- ---------------------------------------------------------------------------

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
      ('Extra', '✨')
  ) AS catalog(name, icon);
$$;

COMMENT ON FUNCTION public.default_income_category_catalog() IS
  'Canonical default income categories: Sueldo (recurring) and Extra (one-time). Household-scoped rows are inserted from this list.';

-- ---------------------------------------------------------------------------
-- 2. Existing households: keep Sueldo + Extra active, archive the rest
-- ---------------------------------------------------------------------------

UPDATE public.categories
SET archived_at = NULL
WHERE type = 'income'
  AND archived_at IS NOT NULL
  AND lower(trim(name)) IN ('sueldo', 'extra');

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
    AND existing.type = 'income'
    AND lower(trim(existing.name)) = lower(catalog.name)
);

UPDATE public.recurring_incomes AS ri
SET category_id = sueldo.id
FROM public.categories AS old
JOIN public.categories AS sueldo
  ON sueldo.household_id = old.household_id
 AND sueldo.type = 'income'
 AND lower(trim(sueldo.name)) = 'sueldo'
WHERE ri.category_id = old.id
  AND old.type = 'income'
  AND lower(trim(old.name)) NOT IN ('sueldo', 'extra');

UPDATE public.categories
SET archived_at = now()
WHERE type = 'income'
  AND archived_at IS NULL
  AND lower(trim(name)) NOT IN ('sueldo', 'extra');

-- ---------------------------------------------------------------------------
-- 3. create_category — expenses only (reactivate archived match, else insert)
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
  v_archived_at timestamptz;
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

  IF p_type = 'income' THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name'
      USING ERRCODE = 'P0001';
  END IF;

  v_icon := nullif(trim(both FROM coalesce(p_icon, '')), '');

  SELECT id, archived_at
  INTO v_id, v_archived_at
  FROM public.categories
  WHERE household_id = v_household_id
    AND type = p_type
    AND lower(trim(name)) = lower(v_name)
  ORDER BY (archived_at IS NULL) DESC, archived_at DESC NULLS LAST, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    IF v_archived_at IS NULL THEN
      RAISE EXCEPTION 'nido.conflict'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.categories
    SET
      archived_at = NULL,
      icon = coalesce(v_icon, icon)
    WHERE id = v_id
      AND household_id = v_household_id
      AND archived_at IS NOT NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'nido.conflict'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN v_id;
  END IF;

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
  'Creates a custom expense category, or reactivates an archived expense row with the same normalized name. Income catalog is Sueldo and Extra only. SECURITY INVOKER.';

-- ---------------------------------------------------------------------------
-- 4. rename / archive — expense only; income names stay Sueldo / Extra
-- ---------------------------------------------------------------------------

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
     OR v_row.archived_at IS NOT NULL
     OR v_row.type = 'income' THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    UPDATE public.categories
    SET name = v_name
    WHERE id = p_category_id
      AND household_id = v_household_id
      AND archived_at IS NULL
      AND type = 'expense';
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
  'Renames an active expense category in the caller''s Nido. Income categories are fixed. Does not rewrite movements. SECURITY INVOKER.';

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

  IF NOT FOUND
     OR v_row.household_id IS DISTINCT FROM v_household_id
     OR v_row.type = 'income' THEN
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
    AND archived_at IS NULL
    AND type = 'expense';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN p_category_id;
END;
$$;

COMMENT ON FUNCTION public.archive_category(uuid) IS
  'Sets archived_at on an expense category. Never DELETE. Income categories are fixed. SECURITY INVOKER.';

-- ---------------------------------------------------------------------------
-- 5. Recurring income cannot use Extra
-- ---------------------------------------------------------------------------

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
  v_category_name text;
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

  SELECT household_id, type, archived_at, name
  INTO v_category_household, v_category_type, v_category_archived, v_category_name
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND
     OR v_category_household IS DISTINCT FROM p_household_id
     OR v_category_type IS DISTINCT FROM 'income'
     OR v_category_archived IS NOT NULL
     OR lower(trim(v_category_name)) = 'extra' THEN
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
  'Inserts an income template. Extra is not recurring. Does not insert incomes. SECURITY INVOKER. created_by and member_id are auth.uid(). next_occurrence starts at start_date.';

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
