-- =============================================================================
-- Monthly balance payment confirmations
--
-- Product:
--   Each calendar month with derived inter-member debt has a "Pagar" action.
--   Every active member must confirm from their own account. When all have
--   confirmed, the UI treats that month's debt as paid (zeroed). Confirmations
--   are not a payment ledger and do not rewrite expenses.
--
-- When shared expenses (or their splits / refunds) for that month change, all
-- confirmations for the month are deleted so a new debt cannot stay hidden.
--
-- Destructive changes: none. Data loss: none.
-- =============================================================================

CREATE TABLE public.monthly_balance_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_balance_confirmations_year_chk
    CHECK (year >= 2000 AND year <= 2100),
  CONSTRAINT monthly_balance_confirmations_month_chk
    CHECK (month >= 1 AND month <= 12),
  CONSTRAINT monthly_balance_confirmations_unique
    UNIQUE (household_id, year, month, user_id)
);

COMMENT ON TABLE public.monthly_balance_confirmations IS
  'One row per active member who confirmed that a calendar month''s derived debt is paid. The month is paid only when every current active member has a row. Not a transfer ledger.';

COMMENT ON COLUMN public.monthly_balance_confirmations.year IS
  'Calendar year of the monthly balance in America/Mexico_City.';

COMMENT ON COLUMN public.monthly_balance_confirmations.month IS
  'Calendar month 1–12 of the monthly balance in America/Mexico_City.';

CREATE INDEX monthly_balance_confirmations_household_period_idx
  ON public.monthly_balance_confirmations (household_id, year, month);

ALTER TABLE public.monthly_balance_confirmations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.monthly_balance_confirmations FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.monthly_balance_confirmations TO authenticated;
GRANT ALL ON TABLE public.monthly_balance_confirmations TO service_role;

CREATE POLICY monthly_balance_confirmations_select_members
  ON public.monthly_balance_confirmations
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY monthly_balance_confirmations_insert_self
  ON public.monthly_balance_confirmations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND user_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- Clear confirmations when the month's shared debt inputs change.
-- SECURITY DEFINER: authenticated has no DELETE on this table; the trigger
-- must wipe every member's row for that month, not only the actor's.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_monthly_balance_confirmations(
  p_household_id uuid,
  p_occurred_at date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_household_id IS NULL OR p_occurred_at IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.monthly_balance_confirmations
  WHERE household_id = p_household_id
    AND year = EXTRACT(YEAR FROM p_occurred_at)::integer
    AND month = EXTRACT(MONTH FROM p_occurred_at)::integer;
END;
$$;

COMMENT ON FUNCTION public.clear_monthly_balance_confirmations(uuid, date) IS
  'Deletes every payment confirmation for the household calendar month of p_occurred_at. Used by triggers when shared expense inputs change. SECURITY DEFINER only to delete other members'' rows; it does not grant clients DELETE.';

REVOKE ALL ON FUNCTION public.clear_monthly_balance_confirmations(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_monthly_balance_confirmations(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_clear_monthly_balance_confirmations_from_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scope = 'shared' THEN
      PERFORM public.clear_monthly_balance_confirmations(NEW.household_id, NEW.occurred_at);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.scope = 'shared' AND (
      NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.payer_id IS DISTINCT FROM OLD.payer_id
      OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
      OR NEW.scope IS DISTINCT FROM OLD.scope
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.household_id IS DISTINCT FROM OLD.household_id
    ) THEN
      PERFORM public.clear_monthly_balance_confirmations(OLD.household_id, OLD.occurred_at);
      IF NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
        OR NEW.household_id IS DISTINCT FROM OLD.household_id
      THEN
        IF NEW.scope = 'shared' THEN
          PERFORM public.clear_monthly_balance_confirmations(NEW.household_id, NEW.occurred_at);
        END IF;
      END IF;
    ELSIF NEW.scope = 'shared' AND OLD.scope IS DISTINCT FROM 'shared' THEN
      PERFORM public.clear_monthly_balance_confirmations(NEW.household_id, NEW.occurred_at);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.scope = 'shared' THEN
      PERFORM public.clear_monthly_balance_confirmations(OLD.household_id, OLD.occurred_at);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_clear_monthly_balance_confirmations_from_expense
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clear_monthly_balance_confirmations_from_expense();

CREATE OR REPLACE FUNCTION public.trg_clear_monthly_balance_confirmations_from_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid := COALESCE(NEW.expense_id, OLD.expense_id);
  v_household_id uuid;
  v_occurred_at date;
  v_scope public.expense_scope;
BEGIN
  SELECT e.household_id, e.occurred_at, e.scope
  INTO v_household_id, v_occurred_at, v_scope
  FROM public.expenses AS e
  WHERE e.id = v_expense_id;

  IF FOUND AND v_scope = 'shared' THEN
    PERFORM public.clear_monthly_balance_confirmations(v_household_id, v_occurred_at);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clear_monthly_balance_confirmations_from_split
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clear_monthly_balance_confirmations_from_split();

CREATE OR REPLACE FUNCTION public.trg_clear_monthly_balance_confirmations_from_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_occurred_at date;
  v_scope public.expense_scope;
BEGIN
  SELECT e.household_id, e.occurred_at, e.scope
  INTO v_household_id, v_occurred_at, v_scope
  FROM public.expenses AS e
  WHERE e.id = NEW.expense_id;

  IF FOUND AND v_scope = 'shared' THEN
    PERFORM public.clear_monthly_balance_confirmations(v_household_id, v_occurred_at);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clear_monthly_balance_confirmations_from_refund
  AFTER INSERT ON public.expense_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clear_monthly_balance_confirmations_from_refund();

REVOKE ALL ON FUNCTION public.trg_clear_monthly_balance_confirmations_from_expense() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_clear_monthly_balance_confirmations_from_split() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_clear_monthly_balance_confirmations_from_refund() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- confirm_monthly_balance
-- household_id is never taken from the client. auth.uid() → active membership.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_monthly_balance(
  p_year integer,
  p_month integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_today date;
  v_member_count integer;
  v_confirmed_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_year IS NULL OR p_month IS NULL
    OR p_month < 1 OR p_month > 12
    OR p_year < 2000 OR p_year > 2100
  THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  v_today := public.nido_today();
  IF p_year > EXTRACT(YEAR FROM v_today)::integer
    OR (
      p_year = EXTRACT(YEAR FROM v_today)::integer
      AND p_month > EXTRACT(MONTH FROM v_today)::integer
    )
  THEN
    RAISE EXCEPTION 'nido.invalid_date'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT hm.household_id
  INTO v_household_id
  FROM public.household_members AS hm
  WHERE hm.user_id = v_user_id
    AND hm.left_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.not_a_member'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.monthly_balance_confirmations (
    household_id, year, month, user_id
  ) VALUES (
    v_household_id, p_year, p_month, v_user_id
  )
  ON CONFLICT ON CONSTRAINT monthly_balance_confirmations_unique
  DO NOTHING;

  SELECT COUNT(*)::integer
  INTO v_member_count
  FROM public.household_members AS hm
  WHERE hm.household_id = v_household_id
    AND hm.left_at IS NULL;

  SELECT COUNT(*)::integer
  INTO v_confirmed_count
  FROM public.monthly_balance_confirmations AS c
  WHERE c.household_id = v_household_id
    AND c.year = p_year
    AND c.month = p_month
    AND EXISTS (
      SELECT 1
      FROM public.household_members AS hm
      WHERE hm.household_id = v_household_id
        AND hm.user_id = c.user_id
        AND hm.left_at IS NULL
    );

  RETURN v_member_count > 0 AND v_confirmed_count >= v_member_count;
END;
$$;

COMMENT ON FUNCTION public.confirm_monthly_balance(integer, integer) IS
  'Records that auth.uid() confirmed the active Nido''s calendar month as paid. Idempotent. Returns true when every current active member has confirmed. SECURITY INVOKER; RLS remains the insert authority. household_id is not a client argument.';

REVOKE ALL ON FUNCTION public.confirm_monthly_balance(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_monthly_balance(integer, integer) TO authenticated;
