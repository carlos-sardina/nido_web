-- Category create reactivates an archived row with the same normalized name
-- instead of inserting a duplicate. Unique (household, lower(trim(name)), type)
-- applies to archived rows too, so a name cannot exist twice in a Nido.

-- ---------------------------------------------------------------------------
-- 1. Rename leftover duplicates so the new unique index can be created.
-- Keep the active / default / newest row; suffix the rest.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  dup record;
  new_name text;
  n integer;
BEGIN
  FOR dup IN
    WITH ranked AS (
      SELECT
        id,
        household_id,
        name,
        type,
        row_number() OVER (
          PARTITION BY household_id, lower(trim(name)), type
          ORDER BY
            (archived_at IS NULL) DESC,
            is_default DESC,
            created_at DESC,
            id
        ) AS rn
      FROM public.categories
    )
    SELECT id, household_id, name, type
    FROM ranked
    WHERE rn > 1
  LOOP
    n := 2;
    LOOP
      new_name := left(trim(dup.name), 70) || ' (' || n::text || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.categories
        WHERE household_id = dup.household_id
          AND type = dup.type
          AND id IS DISTINCT FROM dup.id
          AND lower(trim(name)) = lower(trim(new_name))
      );
      n := n + 1;
    END LOOP;

    UPDATE public.categories
    SET name = new_name
    WHERE id = dup.id;
  END LOOP;
END;
$$;

DROP INDEX IF EXISTS public.categories_active_name_type_idx;

CREATE UNIQUE INDEX categories_name_type_idx
  ON public.categories (household_id, lower(trim(name)), type);

COMMENT ON INDEX public.categories_name_type_idx IS
  'No duplicate category names of the same type in a household, including archived rows. Create reactivates instead of inserting.';

-- ---------------------------------------------------------------------------
-- 2. create_category — reactivate archived match, else insert
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
  'Creates a custom category, or reactivates an archived row with the same normalized name and type. Never inserts a duplicate. SECURITY INVOKER.';
