-- Phase 9.4.2 — persist onboarding savings stock, estimates as initial
-- budgets, and households.default_split_method with the new Nido.
--
-- Why a new table:
--   Savings are financial stock. incomes / expenses are flows. goals
--   require a target. A household/profile column cannot express personal
--   + shared stock. Visibility RLS for personal rows is 9.4.3; this table
--   uses the current open-member SELECT model.
--
-- Why no onboarding_id:
--   A user has one active membership. Retry after a finished create hits
--   nido.already_in_nido and returns that household without inserting
--   again. Unique (household_id, member_id) on savings and the live
--   budget unique index are the remaining backstops. A second key would
--   not add a product-visible distinction.
--
-- Why extend this RPC:
--   PostgREST cannot wrap create_household + split + savings + categories
--   + budgets + income in one client transaction.
--
-- SECURITY INVOKER. No service_role. No client household_id, created_by,
-- member_id, category_id, or date. auth.uid() is the only identity.
-- Existing 2-argument calls keep working (new parameters have defaults).

-- ---------------------------------------------------------------------------
-- 1. savings_balances — personal / shared stock
-- ---------------------------------------------------------------------------

CREATE TABLE public.savings_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  recorded_at date NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT savings_balances_amount_non_negative CHECK (amount >= 0)
);

COMMENT ON TABLE public.savings_balances IS
  'Current savings stock. member_id NULL = shared / Nido stock; set = personal stock. Not an income, expense, goal, or contribution. Update in place; do not append fake movements.';

COMMENT ON COLUMN public.savings_balances.member_id IS
  'NULL means shared Nido stock. Non-null means personal stock for that member.';

COMMENT ON COLUMN public.savings_balances.amount IS
  'Stock amount. >= 0. Zero is a valid recorded stock.';

COMMENT ON COLUMN public.savings_balances.recorded_at IS
  'Calendar date of the snapshot. Onboarding writes today in America/Mexico_City.';

CREATE UNIQUE INDEX savings_balances_unique_scope
  ON public.savings_balances (household_id, member_id)
  NULLS NOT DISTINCT;

CREATE INDEX savings_balances_household_id_idx
  ON public.savings_balances (household_id);

CREATE TRIGGER savings_balances_set_updated_at
  BEFORE UPDATE ON public.savings_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_savings_balances_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id THEN
    RETURN NEW;
  END IF;

  IF NEW.member_id IS NOT NULL THEN
    PERFORM public.assert_active_household_member(NEW.household_id, NEW.member_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER savings_balances_integrity
  BEFORE INSERT OR UPDATE ON public.savings_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_savings_balances_integrity();

-- ---------------------------------------------------------------------------
-- 2. RLS — current membership model. Personal visibility is 9.4.3.
-- ---------------------------------------------------------------------------

ALTER TABLE public.savings_balances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.savings_balances FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.savings_balances TO authenticated;
GRANT ALL ON TABLE public.savings_balances TO service_role;

CREATE POLICY savings_balances_select_members
  ON public.savings_balances
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY savings_balances_insert_active_members
  ON public.savings_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND (
      member_id IS NULL
      OR member_id = auth.uid()
    )
  );

CREATE POLICY savings_balances_update_creator
  ON public.savings_balances
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND (
      member_id IS NULL
      OR member_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. create_household_with_onboarding_income — replace 2-arg signature
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_household_with_onboarding_income(text, numeric);

CREATE OR REPLACE FUNCTION public.create_household_with_onboarding_income(
  p_name text,
  p_income_amount numeric,
  p_split_method public.household_split_method DEFAULT 'equal',
  p_savings_personal numeric DEFAULT NULL,
  p_savings_shared numeric DEFAULT NULL,
  p_estimates jsonb DEFAULT '[]'::jsonb
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
  v_savings_personal numeric(12, 2);
  v_savings_shared numeric(12, 2);
  v_category_id uuid;
  v_today date;
  v_month_start date;
  v_month_end date;
  v_estimates jsonb;
  v_item jsonb;
  v_name text;
  v_icon text;
  v_type text;
  v_estimate_amount numeric(12, 2);
  v_member_id uuid;
  v_budget_id uuid;
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

  IF p_split_method IS NULL OR p_split_method NOT IN ('equal', 'proportional') THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_savings_personal IS NOT NULL THEN
    IF p_savings_personal < 0 OR p_savings_personal > 9999999999.99 THEN
      RAISE EXCEPTION 'nido.invalid_amount'
        USING ERRCODE = 'P0001';
    END IF;
    v_savings_personal := round(p_savings_personal, 2);
    IF v_savings_personal < 0 THEN
      RAISE EXCEPTION 'nido.invalid_amount'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_savings_shared IS NOT NULL THEN
    IF p_savings_shared < 0 OR p_savings_shared > 9999999999.99 THEN
      RAISE EXCEPTION 'nido.invalid_amount'
        USING ERRCODE = 'P0001';
    END IF;
    v_savings_shared := round(p_savings_shared, 2);
    IF v_savings_shared < 0 THEN
      RAISE EXCEPTION 'nido.invalid_amount'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_estimates := coalesce(p_estimates, '[]'::jsonb);
  IF jsonb_typeof(v_estimates) <> 'array' THEN
    RAISE EXCEPTION 'nido.invalid_split'
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
        -- Nido and do not insert a second income, savings row, budget, or
        -- category. An already-active member cannot target another household
        -- because this function takes no household_id.
        RETURN v_household;
      END IF;
      RAISE;
  END;

  UPDATE public.households
  SET default_split_method = p_split_method
  WHERE id = v_household.id
  RETURNING * INTO v_household;

  v_today := (timezone('America/Mexico_City', now()))::date;
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  IF v_savings_personal IS NOT NULL THEN
    INSERT INTO public.savings_balances (
      household_id,
      member_id,
      amount,
      recorded_at,
      created_by
    )
    VALUES (
      v_household.id,
      v_user_id,
      v_savings_personal,
      v_today,
      v_user_id
    );
  END IF;

  IF v_savings_shared IS NOT NULL THEN
    INSERT INTO public.savings_balances (
      household_id,
      member_id,
      amount,
      recorded_at,
      created_by
    )
    VALUES (
      v_household.id,
      NULL,
      v_savings_shared,
      v_today,
      v_user_id
    );
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(v_estimates)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    v_name := trim(both FROM coalesce(v_item->>'name', ''));
    IF v_name = '' OR char_length(v_name) > 80 THEN
      RAISE EXCEPTION 'nido.invalid_name'
        USING ERRCODE = 'P0001';
    END IF;

    v_icon := nullif(trim(both FROM coalesce(v_item->>'icon', '')), '');
    v_type := v_item->>'type';
    IF v_type IS DISTINCT FROM 'personal' AND v_type IS DISTINCT FROM 'shared' THEN
      RAISE EXCEPTION 'nido.invalid_split'
        USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      v_estimate_amount := round((v_item->>'amount')::numeric, 2);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'nido.invalid_amount'
          USING ERRCODE = 'P0001';
    END;

    IF v_estimate_amount IS NULL OR v_estimate_amount < 0 OR v_estimate_amount > 9999999999.99 THEN
      RAISE EXCEPTION 'nido.invalid_amount'
        USING ERRCODE = 'P0001';
    END IF;

    -- Zero / blank estimates are skipped. Positive amounts become budgets.
    IF v_estimate_amount = 0 THEN
      CONTINUE;
    END IF;

    SELECT id
    INTO v_category_id
    FROM public.categories
    WHERE household_id = v_household.id
      AND type = 'expense'
      AND archived_at IS NULL
      AND lower(name) = lower(v_name)
    LIMIT 1;

    IF v_category_id IS NULL THEN
      BEGIN
        v_category_id := public.create_category(v_name, 'expense', v_icon);
      EXCEPTION
        WHEN raise_exception THEN
          IF SQLERRM = 'nido.conflict' THEN
            SELECT id
            INTO v_category_id
            FROM public.categories
            WHERE household_id = v_household.id
              AND type = 'expense'
              AND archived_at IS NULL
              AND lower(name) = lower(v_name)
            LIMIT 1;

            IF v_category_id IS NULL THEN
              RAISE;
            END IF;
          ELSE
            RAISE;
          END IF;
      END;
    END IF;

    IF v_type = 'personal' THEN
      v_member_id := v_user_id;
    ELSE
      v_member_id := NULL;
    END IF;

    BEGIN
      INSERT INTO public.budgets (
        household_id,
        member_id,
        category_id,
        amount,
        period,
        start_date,
        end_date,
        created_by
      )
      VALUES (
        v_household.id,
        v_member_id,
        v_category_id,
        v_estimate_amount,
        'monthly',
        v_month_start,
        v_month_end,
        v_user_id
      )
      RETURNING id INTO v_budget_id;
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE public.budgets
        SET amount = amount + v_estimate_amount
        WHERE household_id = v_household.id
          AND category_id = v_category_id
          AND member_id IS NOT DISTINCT FROM v_member_id
          AND start_date = v_month_start
          AND deleted_at IS NULL
          AND created_by = v_user_id;
    END;
  END LOOP;

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

COMMENT ON FUNCTION public.create_household_with_onboarding_income(text, numeric, public.household_split_method, numeric, numeric, jsonb) IS
  'Creates a household, owner membership, default catalogs, split preference, optional savings stock, initial monthly budgets from estimates, and the onboarding monthly income in one transaction. SECURITY INVOKER. auth.uid() is the only user id. Estimates never write expenses. A second call from an already-active member returns that household and does not insert again.';

REVOKE ALL ON FUNCTION public.create_household_with_onboarding_income(text, numeric, public.household_split_method, numeric, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_household_with_onboarding_income(text, numeric, public.household_split_method, numeric, numeric, jsonb) TO authenticated;
