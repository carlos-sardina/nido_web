-- Phase 9.2.2 — persist the onboarding monthly income with the new Nido
--
-- Why this migration is necessary:
--   PostgREST cannot wrap create_household + create_income in one client
--   transaction. If the income insert failed after the household existed,
--   the user would land in a Nido that looks finished but has no income.
--
-- Why no new tables or columns:
--   The declared monthly net income is a real incomes row. Savings,
--   estimated expenses, and the division preference have no equivalent
--   representation without inventing goals, budgets, or household columns.
--   Those fields stay draft-only and are not persisted.
--
-- Why no unique constraint on "onboarding income":
--   A Sueldo row for this member on this day is not distinguishable from a
--   later Registrar un ingreso. Adding a partial unique index would block
--   legitimate second incomes. Idempotency is the one-transaction create
--   plus an already-active-membership no-op that does not insert again.
--
-- SECURITY INVOKER:
--   Reuses create_household and create_income. Both already run under RLS.
--   auth.uid() is the only identity. The client cannot send household_id,
--   created_by, member_id, category_id, or occurred_at.

CREATE OR REPLACE FUNCTION public.create_household_with_onboarding_income(
  p_name text,
  p_income_amount numeric
)
RETURNS public.households
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_amount numeric(12, 2);
  v_category_id uuid;
  v_today date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_income_amount IS NULL
     OR p_income_amount < 0
     OR p_income_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  v_amount := round(p_income_amount, 2);
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_household := public.create_household(p_name);
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'nido.already_in_nido' THEN
        SELECT h.*
        INTO v_household
        FROM public.households AS h
        INNER JOIN public.household_members AS hm
          ON hm.household_id = h.id
        WHERE hm.user_id = v_user_id
          AND hm.left_at IS NULL;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'nido.already_in_nido'
            USING ERRCODE = 'P0001';
        END IF;

        -- Retry / double submit after a finished create: return the existing
        -- Nido and do not insert a second income. An already-active member
        -- cannot target another household because this function takes no
        -- household_id.
        RETURN v_household;
      END IF;
      RAISE;
  END;

  IF v_amount = 0 THEN
    RETURN v_household;
  END IF;

  SELECT id
  INTO v_category_id
  FROM public.categories
  WHERE household_id = v_household.id
    AND type = 'income'
    AND archived_at IS NULL
    AND lower(name) = lower('Sueldo')
  LIMIT 1;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_category'
      USING ERRCODE = 'P0001';
  END IF;

  v_today := (timezone('America/Mexico_City', now()))::date;

  PERFORM public.create_income(
    v_household.id,
    v_category_id,
    v_amount,
    'Ingreso mensual neto',
    v_today
  );

  RETURN v_household;
END;
$$;

COMMENT ON FUNCTION public.create_household_with_onboarding_income(text, numeric) IS
  'Creates a household, owner membership, default catalogs, and the onboarding monthly income in one transaction. SECURITY INVOKER: RLS still applies. auth.uid() is the only user id. occurred_at is today in America/Mexico_City. A second call from an already-active member returns that household and does not insert another income.';

REVOKE ALL ON FUNCTION public.create_household_with_onboarding_income(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_household_with_onboarding_income(text, numeric) TO authenticated;
