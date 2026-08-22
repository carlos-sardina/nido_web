-- Phase 9.2.4 — expense payer identity on INSERT
--
-- Product rule (same as incomes / recurring_incomes / recurring_expenses):
--   auth.uid()
--   → active household membership
--   → expense.household_id
--   → created_by = auth.uid()
--   → payer_id = auth.uid()
--
-- The registrar is the payer in v1. Shared expenses still split across
-- active members; only the payer identity is locked to the writer.
--
-- create_expense already rejects p_payer_id <> auth.uid(). This migration
-- closes the remaining PostgREST INSERT path. SELECT is unchanged.
-- UPDATE/DELETE stay creator-only; WITH CHECK also keeps payer_id so a
-- creator cannot reattribute payment after insert.
--
-- No new tables. No new columns. SECURITY INVOKER RPCs stay the write path.

DROP POLICY IF EXISTS expenses_insert_active_members ON public.expenses;

CREATE POLICY expenses_insert_active_members
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND payer_id = auth.uid()
    AND public.is_active_member_of(household_id, payer_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

DROP POLICY IF EXISTS expenses_update_creator ON public.expenses;

CREATE POLICY expenses_update_creator
  ON public.expenses
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
    AND payer_id = auth.uid()
    AND public.category_belongs_to_household(category_id, household_id)
  );
