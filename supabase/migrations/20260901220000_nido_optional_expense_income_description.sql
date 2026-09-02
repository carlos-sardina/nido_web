-- One-off expenses and incomes may omit description (same pattern as goals).
-- Recurring templates still require a description.

DO $$
DECLARE
  rec record;
  src text;
  old_check text :=
    'IF v_description = '''' OR char_length(v_description) > 80 THEN';
  new_check text :=
    'IF v_description = '''' THEN
    v_description := NULL;
  ELSIF char_length(v_description) > 80 THEN';
BEGIN
  FOR rec IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_expense',
        'update_expense',
        'create_income',
        'update_income'
      )
  LOOP
    src := pg_get_functiondef(rec.oid);
    IF position(old_check IN src) = 0 THEN
      RAISE EXCEPTION 'Could not patch optional description in %', rec.oid::regprocedure;
    END IF;
    EXECUTE replace(src, old_check, new_check);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.create_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) IS
  'Inserts a confirmed expense and its splits in one transaction. SECURITY INVOKER. created_by is auth.uid(). payer_id may be any active household member, or NULL on a shared expense when every participant paid their share. Personal ignores households.default_split_method (fixed). Shared equal keeps client equal splits. Shared proportional recomputes from confirmed incomes of the current America/Mexico_City month and stores income_based. Description is optional; empty is stored as NULL.';

COMMENT ON FUNCTION public.update_expense(uuid, uuid, numeric, text, date, uuid, public.expense_scope, jsonb) IS
  'Updates a confirmed expense, its payer, and replaces its splits in one transaction. SECURITY INVOKER. Only the creator with an active membership may mutate a non-deleted expense. payer_id may change to another active household member, or to NULL on a shared expense when every participant paid their share. Description is optional; empty is stored as NULL.';

COMMENT ON FUNCTION public.create_income(uuid, uuid, numeric, text, date) IS
  'Inserts a confirmed one-time income. SECURITY INVOKER: RLS still applies. created_by and member_id are auth.uid(). A client-supplied household_id is not enough; the caller must be an active member. Description is optional; empty is stored as NULL.';

COMMENT ON FUNCTION public.update_income(uuid, uuid, numeric, text, date) IS
  'Updates a confirmed income. SECURITY INVOKER: RLS still applies. Household is resolved from the row. Only the creator with an active membership may mutate a non-deleted income. Description is optional; empty is stored as NULL.';
