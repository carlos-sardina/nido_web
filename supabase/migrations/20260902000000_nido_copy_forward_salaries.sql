-- =============================================================================
-- Copy Sueldo incomes into the current (and missed) calendar months.
--
-- Product:
--   Sueldo is recurring until the user deletes it or changes the amount.
--   Extra stays one-time. An edit updates only the current row; later months
--   copy that new amount. Past months are never rewritten.
--
-- Why SECURITY DEFINER:
--   incomes INSERT RLS requires created_by = auth.uid() and member_id =
--   auth.uid(). Household totals and income-based splits need every active
--   member's Sueldo when any member opens the app. The function resolves the
--   caller's active Nido from auth.uid(), copies existing Sueldo rows only,
--   preserves member_id and created_by, and is granted only to authenticated.
-- =============================================================================

ALTER TABLE public.incomes
  ADD COLUMN copied_from_id uuid REFERENCES public.incomes (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.incomes.copied_from_id IS
  'Previous-month Sueldo this confirmed row was copied from. NULL for a row the user registered. A deleted descendant blocks a second copy of that source in the same month.';

CREATE INDEX incomes_copied_from_id_idx
  ON public.incomes (copied_from_id);

CREATE UNIQUE INDEX incomes_copied_from_month_idx
  ON public.incomes (copied_from_id, (date_trunc('month', occurred_at::timestamp)))
  WHERE copied_from_id IS NOT NULL;

COMMENT ON INDEX public.incomes_copied_from_month_idx IS
  'At most one copy of a Sueldo source per calendar month, including soft-deleted rows so a delete is not resurrected.';

CREATE OR REPLACE FUNCTION public.copy_forward_month_salaries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_today date;
  v_current_start date;
  v_target_start date;
  v_target_end date;
  v_source_start date;
  v_source_end date;
  v_copied integer := 0;
  v_offset integer;
  v_source public.incomes%ROWTYPE;
  v_occurred date;
  v_day integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id
  INTO v_household_id
  FROM public.household_members
  WHERE user_id = v_user_id
    AND left_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  v_today := (timezone('America/Mexico_City', now()))::date;
  v_current_start := date_trunc('month', v_today)::date;

  PERFORM pg_advisory_xact_lock(871002, hashtext(v_household_id::text));

  FOR v_offset IN REVERSE 11..0 LOOP
    v_target_start := (v_current_start - make_interval(months => v_offset))::date;
    v_target_end := (v_target_start + interval '1 month - 1 day')::date;
    v_source_start := (v_target_start - interval '1 month')::date;
    v_source_end := (v_target_start - interval '1 day')::date;

    FOR v_source IN
      SELECT i.*
      FROM public.incomes i
      JOIN public.categories c ON c.id = i.category_id
      WHERE i.household_id = v_household_id
        AND i.deleted_at IS NULL
        AND i.recurring_id IS NULL
        AND i.occurred_at >= v_source_start
        AND i.occurred_at <= v_source_end
        AND i.amount > 0
        AND c.type = 'income'
        AND c.archived_at IS NULL
        AND lower(c.name) = lower('Sueldo')
        AND EXISTS (
          SELECT 1
          FROM public.household_members hm
          WHERE hm.household_id = v_household_id
            AND hm.user_id = i.member_id
            AND hm.left_at IS NULL
        )
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.incomes t
        WHERE t.copied_from_id = v_source.id
          AND t.occurred_at >= v_target_start
          AND t.occurred_at <= v_target_end
      ) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.incomes t
        JOIN public.categories c ON c.id = t.category_id
        WHERE t.household_id = v_household_id
          AND t.deleted_at IS NULL
          AND t.member_id = v_source.member_id
          AND t.category_id = v_source.category_id
          AND t.occurred_at >= v_target_start
          AND t.occurred_at <= v_target_end
          AND coalesce(trim(t.description), '') = coalesce(trim(v_source.description), '')
          AND c.type = 'income'
          AND lower(c.name) = lower('Sueldo')
      ) THEN
        CONTINUE;
      END IF;

      v_day := LEAST(
        EXTRACT(DAY FROM v_source.occurred_at)::int,
        EXTRACT(DAY FROM v_target_end)::int
      );
      v_occurred := make_date(
        EXTRACT(YEAR FROM v_target_start)::int,
        EXTRACT(MONTH FROM v_target_start)::int,
        v_day
      );

      BEGIN
        INSERT INTO public.incomes (
          household_id,
          member_id,
          category_id,
          amount,
          description,
          occurred_at,
          recurring_id,
          created_by,
          copied_from_id
        ) VALUES (
          v_source.household_id,
          v_source.member_id,
          v_source.category_id,
          v_source.amount,
          v_source.description,
          v_occurred,
          NULL,
          v_source.created_by,
          v_source.id
        );
        v_copied := v_copied + 1;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN v_copied;
END;
$$;

COMMENT ON FUNCTION public.copy_forward_month_salaries() IS
  'Copies live Sueldo incomes into the current America/Mexico_City month and any missed months in the last 12. Extra and recurring-template occurrences are skipped. A deleted copy stops that lineage. SECURITY DEFINER so one active member can roll forward every active member''s Sueldo; auth.uid() is the only actor identity. Does not take household_id from the client.';

REVOKE ALL ON FUNCTION public.copy_forward_month_salaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_forward_month_salaries() TO authenticated;
