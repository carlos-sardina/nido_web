-- Phase 9.4.5 — expense refunds
--
-- A refund is a positive operation linked to an existing expense.
-- It is not a negative expense. expenses.amount is never rewritten.
--
--   expense
--     └── expense_refunds
--           └── expense_refund_splits  (frozen at create time)
--
-- expense_splits are mutable via update_expense, so refund splits are
-- persisted when the refund is created. A later edit of the expense is
-- rejected while refunds exist (soft-delete of the expense is still
-- allowed). Refunds themselves are immutable: no UPDATE, no DELETE,
-- no deleted_at. Historical rows stay with the expense.
--
-- Who writes: same as expense mutation — creator, active member, live
-- expense (can_mutate_expense). Scope is inherited from the parent;
-- there is no scope column. SELECT follows the parent expense, so
-- personal_visibility applies without a second privacy rule.
--
-- create_expense_refund is SECURITY INVOKER. The client sends only
-- expense_id and amount. Splits are generated in the same transaction
-- with the same proportional remainder convention as
-- allocateIncomeBasedSplits (last participant absorbs leftover cents).
--
-- Concurrency: SELECT expenses … FOR UPDATE serializes refunds of the
-- same expense so two overlapping requests cannot exceed expenses.amount.
--
-- SECURITY DEFINER is used only on integrity triggers that must see
-- every refund of the expense (not only rows the actor can SELECT).
-- search_path is pinned. They do not grant write access.

-- ---------------------------------------------------------------------------
-- 1. expense_refunds
-- ---------------------------------------------------------------------------

CREATE TABLE public.expense_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  occurred_at date NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_refunds_amount_positive CHECK (amount > 0)
);

COMMENT ON TABLE public.expense_refunds IS
  'Positive refund linked to an existing expense. Not a negative expense. Immutable after insert. Budget consumption attributes the refund to the parent expense month, not occurred_at.';

COMMENT ON COLUMN public.expense_refunds.amount IS
  'Money returned. Must be > 0. Live refunds of one expense cannot sum past expenses.amount (enforced in create_expense_refund under FOR UPDATE).';

COMMENT ON COLUMN public.expense_refunds.occurred_at IS
  'Calendar date the refund was recorded (today America/Mexico_City on create). Used by derived Activity. Budget spent uses the parent expense occurred_at.';

COMMENT ON COLUMN public.expense_refunds.created_by IS
  'auth.uid() at create time. Same person who may mutate the parent expense.';

CREATE INDEX expense_refunds_expense_id_idx
  ON public.expense_refunds (expense_id);

CREATE INDEX expense_refunds_created_by_idx
  ON public.expense_refunds (created_by);

CREATE TRIGGER expense_refunds_set_updated_at
  BEFORE UPDATE ON public.expense_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. expense_refund_splits
-- ---------------------------------------------------------------------------

CREATE TABLE public.expense_refund_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.expense_refunds (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  percentage numeric(7, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_refund_splits_unique_participant UNIQUE (refund_id, member_id),
  CONSTRAINT expense_refund_splits_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT expense_refund_splits_percentage_range
    CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100))
);

COMMENT ON TABLE public.expense_refund_splits IS
  'Frozen allocation of a refund. Generated from expense_splits at create time. member_id matches expense_splits (profiles.id). Historical participants who have left the Nido stay on the row; there is no active-membership trigger.';

COMMENT ON COLUMN public.expense_refund_splits.amount IS
  'Refund share. SUM(amount) must equal expense_refunds.amount (enforced in create_expense_refund).';

COMMENT ON COLUMN public.expense_refund_splits.percentage IS
  'Frozen copy of the parent expense_splits.percentage at refund create time.';

COMMENT ON COLUMN public.expense_refund_splits.member_id IS
  'Same identity as expense_splits.member_id (profiles.id).';

CREATE INDEX expense_refund_splits_refund_id_idx
  ON public.expense_refund_splits (refund_id);

CREATE INDEX expense_refund_splits_member_id_idx
  ON public.expense_refund_splits (member_id);

CREATE TRIGGER expense_refund_splits_set_updated_at
  BEFORE UPDATE ON public.expense_refund_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Integrity: do not rewrite an expense that already has refunds
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_expenses_reject_edit_with_refunds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.expense_refunds AS r
    WHERE r.expense_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Soft-delete is allowed. Rewriting amount, category, scope, date,
  -- description, payer, or distribution would silently diverge from
  -- frozen refund splits.
  IF NEW.deleted_at IS NOT NULL
     AND OLD.deleted_at IS NULL
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.occurred_at IS NOT DISTINCT FROM OLD.occurred_at
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope
     AND NEW.distribution_method IS NOT DISTINCT FROM OLD.distribution_method
     AND NEW.payer_id IS NOT DISTINCT FROM OLD.payer_id
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.recurring_id IS NOT DISTINCT FROM OLD.recurring_id
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'nido.expense_has_refunds'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.trg_expenses_reject_edit_with_refunds() IS
  'Blocks update_expense-style rewrites while refunds exist. Soft-delete still works. SECURITY DEFINER so the check sees every refund of the expense, not only rows the actor can SELECT. search_path is pinned. Does not grant write access.';

CREATE TRIGGER expenses_reject_edit_with_refunds
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_expenses_reject_edit_with_refunds();

CREATE OR REPLACE FUNCTION public.trg_expense_splits_reject_edit_with_refunds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid := COALESCE(NEW.expense_id, OLD.expense_id);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.expense_refunds AS r
    WHERE r.expense_id = v_expense_id
  ) THEN
    RAISE EXCEPTION 'nido.expense_has_refunds'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trg_expense_splits_reject_edit_with_refunds() IS
  'Blocks replacing expense_splits while refunds exist so frozen refund allocations stay aligned with the original split. SECURITY DEFINER + pinned search_path. Does not grant write access.';

CREATE TRIGGER expense_splits_reject_edit_with_refunds
  BEFORE INSERT OR UPDATE OR DELETE ON public.expense_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_expense_splits_reject_edit_with_refunds();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.expense_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_refund_splits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.expense_refunds FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.expense_refund_splits FROM PUBLIC, anon;

GRANT SELECT, INSERT ON TABLE public.expense_refunds TO authenticated;
GRANT SELECT, INSERT ON TABLE public.expense_refund_splits TO authenticated;
GRANT ALL ON TABLE public.expense_refunds TO service_role;
GRANT ALL ON TABLE public.expense_refund_splits TO service_role;

-- SELECT inherits the parent expense, including personal_visibility.
CREATE POLICY expense_refunds_select_via_expense
  ON public.expense_refunds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses AS e
      WHERE e.id = expense_id
    )
  );

CREATE POLICY expense_refunds_insert_creator
  ON public.expense_refunds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_mutate_expense(expense_id)
    AND created_by = auth.uid()
  );

CREATE POLICY expense_refund_splits_select_via_refund
  ON public.expense_refund_splits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expense_refunds AS r
      WHERE r.id = refund_id
    )
  );

CREATE POLICY expense_refund_splits_insert_creator
  ON public.expense_refund_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.expense_refunds AS r
      WHERE r.id = refund_id
        AND public.can_mutate_expense(r.expense_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. create_expense_refund — atomic create + frozen splits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_expense_refund(
  p_expense_id uuid,
  p_amount numeric
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
  v_expense_amount numeric(12, 2);
  v_amount numeric(12, 2);
  v_refunded numeric(12, 2);
  v_remaining numeric(12, 2);
  v_refund_id uuid;
  v_today date;
  v_splits public.expense_splits[];
  v_split_count integer;
  v_total_basis numeric(12, 2);
  v_total_cents integer;
  v_assigned_cents integer := 0;
  v_cents integer;
  v_i integer;
  v_split_sum numeric(12, 2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_expense_id IS NULL THEN
    RAISE EXCEPTION 'nido.expense_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the expense so concurrent refunds serialize the remaining check.
  SELECT household_id, created_by, deleted_at, amount
  INTO v_household_id, v_created_by, v_deleted_at, v_expense_amount
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

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

  SELECT coalesce(sum(r.amount), 0)
  INTO v_refunded
  FROM public.expense_refunds AS r
  WHERE r.expense_id = p_expense_id;

  v_remaining := v_expense_amount - v_refunded;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'nido.invalid_amount'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(s ORDER BY s.created_at, s.id), ARRAY[]::public.expense_splits[])
  INTO v_splits
  FROM public.expense_splits AS s
  WHERE s.expense_id = p_expense_id;

  v_split_count := coalesce(array_length(v_splits, 1), 0);
  IF v_split_count < 1 THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  v_total_basis := 0;
  FOR v_i IN 1..v_split_count LOOP
    v_total_basis := v_total_basis + v_splits[v_i].amount;
  END LOOP;

  IF v_total_basis <= 0 THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  v_today := (timezone('America/Mexico_City', now()))::date;

  INSERT INTO public.expense_refunds (
    expense_id,
    amount,
    occurred_at,
    created_by
  ) VALUES (
    p_expense_id,
    v_amount,
    v_today,
    v_user_id
  )
  RETURNING id INTO v_refund_id;

  -- Same remainder convention as allocateIncomeBasedSplits: last
  -- participant absorbs leftover cents so SUM(splits) = refund.amount.
  v_total_cents := round(v_amount * 100);

  FOR v_i IN 1..v_split_count LOOP
    IF v_i = v_split_count THEN
      v_cents := v_total_cents - v_assigned_cents;
    ELSE
      v_cents := round((v_splits[v_i].amount / v_total_basis) * v_total_cents);
      v_assigned_cents := v_assigned_cents + v_cents;
    END IF;

    INSERT INTO public.expense_refund_splits (
      refund_id,
      member_id,
      amount,
      percentage
    ) VALUES (
      v_refund_id,
      v_splits[v_i].member_id,
      v_cents / 100.0,
      v_splits[v_i].percentage
    );

    v_split_sum := v_split_sum + (v_cents / 100.0);
  END LOOP;

  IF v_split_sum <> v_amount THEN
    RAISE EXCEPTION 'nido.invalid_split'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_refund_id;
END;
$$;

COMMENT ON FUNCTION public.create_expense_refund(uuid, numeric) IS
  'Creates a refund and its frozen splits in one transaction. SECURITY INVOKER. Client sends only expense_id and amount. Locks the expense (FOR UPDATE), rejects over-cap / deleted / unauthorized, and allocates shares from current expense_splits with the last participant absorbing leftover cents. occurred_at is today America/Mexico_City.';

REVOKE ALL ON FUNCTION public.create_expense_refund(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_expense_refund(uuid, numeric) TO authenticated;
