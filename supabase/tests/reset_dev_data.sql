-- =============================================================================
-- Nido development data reset
--
-- DEVELOPMENT ONLY. DESTRUCTIVE.
--
-- This script deletes all Nido application/test data and all Supabase Auth
-- users from the linked development project. It does not change schema,
-- migrations, RLS, functions, triggers, indexes, enums, or Auth settings.
--
-- Expected project: nido_dev / pxfdvhavcddqmhuljxlf
--
-- PostgreSQL does not expose the Supabase project ref as a reliable database
-- identifier. This script therefore fails closed unless the current session
-- has already set the development-only confirmation GUC to that project ref:
--
--   SELECT set_config(
--     'nido.reset_dev_data_confirm',
--     'pxfdvhavcddqmhuljxlf',
--     false
--   );
--
-- Run that statement in the SAME session, then execute this file. Any other
-- value, including a missing setting, raises and rolls back.
--
-- Do not run this against production. Do not run it from CI or app startup.
-- This file is not executed automatically.
-- =============================================================================

BEGIN;

-- Fail closed: require an explicit same-session confirmation of nido_dev.
DO $$
DECLARE
  v_confirm text;
  v_expected constant text := 'pxfdvhavcddqmhuljxlf';
BEGIN
  v_confirm := current_setting('nido.reset_dev_data_confirm', true);

  IF v_confirm IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'nido.reset_dev_data_refused: this script is DEVELOPMENT ONLY for nido_dev (%). Set nido.reset_dev_data_confirm to that project ref in this session before running. Received: %',
      v_expected,
      COALESCE(v_confirm, '<unset>')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Application data
--
-- Explicit DELETEs in FK-safe order. Integrity triggers are INSERT/UPDATE
-- only, so they do not block DELETE. Profile-referenced columns use
-- ON DELETE RESTRICT, so child rows must be removed before profiles.
-- -----------------------------------------------------------------------------

DELETE FROM public.goal_contributions;
DELETE FROM public.expense_splits;
DELETE FROM public.recurring_expense_splits;
DELETE FROM public.budgets;
DELETE FROM public.incomes;
DELETE FROM public.expenses;
DELETE FROM public.recurring_incomes;
DELETE FROM public.recurring_expenses;
DELETE FROM public.goals;
DELETE FROM public.categories;
DELETE FROM public.household_invitations;
DELETE FROM public.household_members;
DELETE FROM public.households;
DELETE FROM public.profiles;

-- -----------------------------------------------------------------------------
-- Auth users
--
-- public.profiles is the only application table that references auth.users
-- (ON DELETE CASCADE). After profiles is empty, deleting auth.users cannot
-- leave inconsistent Nido rows. handle_new_user fires AFTER INSERT only.
-- Auth-internal rows (identities, sessions, tokens) are left to Auth's own
-- foreign keys; this script does not modify other auth.* tables.
-- -----------------------------------------------------------------------------

DELETE FROM auth.users;

-- -----------------------------------------------------------------------------
-- Verification: every count must be 0
-- -----------------------------------------------------------------------------

SELECT 'auth.users' AS table_name, count(*)::bigint AS row_count FROM auth.users
UNION ALL
SELECT 'profiles', count(*) FROM public.profiles
UNION ALL
SELECT 'households', count(*) FROM public.households
UNION ALL
SELECT 'household_members', count(*) FROM public.household_members
UNION ALL
SELECT 'household_invitations', count(*) FROM public.household_invitations
UNION ALL
SELECT 'categories', count(*) FROM public.categories
UNION ALL
SELECT 'recurring_incomes', count(*) FROM public.recurring_incomes
UNION ALL
SELECT 'incomes', count(*) FROM public.incomes
UNION ALL
SELECT 'recurring_expenses', count(*) FROM public.recurring_expenses
UNION ALL
SELECT 'recurring_expense_splits', count(*) FROM public.recurring_expense_splits
UNION ALL
SELECT 'expenses', count(*) FROM public.expenses
UNION ALL
SELECT 'expense_splits', count(*) FROM public.expense_splits
UNION ALL
SELECT 'budgets', count(*) FROM public.budgets
UNION ALL
SELECT 'goals', count(*) FROM public.goals
UNION ALL
SELECT 'goal_contributions', count(*) FROM public.goal_contributions
ORDER BY table_name;

DO $$
DECLARE
  v_auth_users bigint;
  v_profiles bigint;
  v_households bigint;
  v_household_members bigint;
  v_household_invitations bigint;
  v_categories bigint;
  v_recurring_incomes bigint;
  v_incomes bigint;
  v_recurring_expenses bigint;
  v_recurring_expense_splits bigint;
  v_expenses bigint;
  v_expense_splits bigint;
  v_budgets bigint;
  v_goals bigint;
  v_goal_contributions bigint;
BEGIN
  SELECT count(*) INTO v_auth_users FROM auth.users;
  SELECT count(*) INTO v_profiles FROM public.profiles;
  SELECT count(*) INTO v_households FROM public.households;
  SELECT count(*) INTO v_household_members FROM public.household_members;
  SELECT count(*) INTO v_household_invitations FROM public.household_invitations;
  SELECT count(*) INTO v_categories FROM public.categories;
  SELECT count(*) INTO v_recurring_incomes FROM public.recurring_incomes;
  SELECT count(*) INTO v_incomes FROM public.incomes;
  SELECT count(*) INTO v_recurring_expenses FROM public.recurring_expenses;
  SELECT count(*) INTO v_recurring_expense_splits FROM public.recurring_expense_splits;
  SELECT count(*) INTO v_expenses FROM public.expenses;
  SELECT count(*) INTO v_expense_splits FROM public.expense_splits;
  SELECT count(*) INTO v_budgets FROM public.budgets;
  SELECT count(*) INTO v_goals FROM public.goals;
  SELECT count(*) INTO v_goal_contributions FROM public.goal_contributions;

  IF v_auth_users > 0
     OR v_profiles > 0
     OR v_households > 0
     OR v_household_members > 0
     OR v_household_invitations > 0
     OR v_categories > 0
     OR v_recurring_incomes > 0
     OR v_incomes > 0
     OR v_recurring_expenses > 0
     OR v_recurring_expense_splits > 0
     OR v_expenses > 0
     OR v_expense_splits > 0
     OR v_budgets > 0
     OR v_goals > 0
     OR v_goal_contributions > 0 THEN
    RAISE EXCEPTION
      'nido.reset_dev_data_incomplete: remaining rows auth.users=% profiles=% households=% household_members=% household_invitations=% categories=% recurring_incomes=% incomes=% recurring_expenses=% recurring_expense_splits=% expenses=% expense_splits=% budgets=% goals=% goal_contributions=%',
      v_auth_users,
      v_profiles,
      v_households,
      v_household_members,
      v_household_invitations,
      v_categories,
      v_recurring_incomes,
      v_incomes,
      v_recurring_expenses,
      v_recurring_expense_splits,
      v_expenses,
      v_expense_splits,
      v_budgets,
      v_goals,
      v_goal_contributions
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMIT;
