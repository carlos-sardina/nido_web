-- =============================================================================
-- Nido RLS security matrix
--
-- Runtime behavioral tests. They are NOT executed in this repository's
-- default environment (no local Postgres / Supabase CLI).
--
-- Required environment:
--   1. Supabase local (`supabase start`) or a linked Supabase database
--   2. Migrations applied (foundation, RLS, lifecycle, categories/create_expense,
--      expense mutations, goal mutations, goal contribution mutations,
--      goal contribution edit / soft-delete, income mutations,
--      budget mutations, owner transfer, recurrence mutations,
--      onboarding financial persist, household categories/split,
--      onboarding savings / budgets, personal visibility,
--      budget consumption visibility, expense refunds)
--   3. Roles `authenticated` and `service_role`
--   4. `auth.uid()` and `auth.users`
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/tests/rls_security_matrix.sql
--
-- or with psql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_security_matrix.sql
--
-- or, after `supabase start`:
--   supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_security_matrix.sql
--
-- The script inserts temporary auth users and rolls back at the end.
-- It does not claim success unless every assertion passes.
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION
      'auth.uid() is not available. Run this script against a Supabase database.';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION
      'auth.users is not available. Run this script against a Supabase database.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION
      'Role authenticated is missing. Run this script against a Supabase database.';
  END IF;
END;
$$;

BEGIN;

CREATE TEMP TABLE rls_test_results (
  test_id text PRIMARY KEY,
  actor text NOT NULL,
  household text NOT NULL,
  membership text NOT NULL,
  operation text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  passed boolean NOT NULL
);

CREATE TEMP TABLE rls_ids (
  key text PRIMARY KEY,
  id uuid NOT NULL
);

-- Hosted Supabase SET LOCAL ROLE authenticated cannot write temp tables
-- created by the login role unless those privileges are granted.
GRANT ALL ON TABLE rls_test_results TO authenticated;
GRANT ALL ON TABLE rls_ids TO authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.record_result(
  p_test_id text,
  p_actor text,
  p_household text,
  p_membership text,
  p_operation text,
  p_expected text,
  p_actual text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO rls_test_results (
    test_id, actor, household, membership, operation, expected, actual, passed
  ) VALUES (
    p_test_id,
    p_actor,
    p_household,
    p_membership,
    p_operation,
    p_expected,
    p_actual,
    p_expected = p_actual
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  SET LOCAL ROLE authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.clear_auth()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_auth_user(
  p_id uuid,
  p_email text,
  p_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt('nido-rls-test', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_name),
    now(),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_allow(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_rowcount integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  -- RLS USING filters UPDATE/DELETE to zero rows without raising.
  -- Treat that as deny so silent filtering is not recorded as allow.
  IF v_rowcount = 0 AND p_sql ~* '^\s*(UPDATE|DELETE)' THEN
    RETURN 'deny';
  END IF;
  RETURN 'allow';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'deny';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_exception(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'allow';
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_count(p_sql text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE p_sql INTO v_count;
  RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- Seed: Carlos + Diana in Nido A; Luis in Nido B
-- Seed writes use the table owner (this session) so they are not the
-- subject of the RLS assertions below.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid := '11111111-1111-1111-1111-111111111111';
  v_diana uuid := '22222222-2222-2222-2222-222222222222';
  v_luis uuid := '33333333-3333-3333-3333-333333333333';
  v_nido_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_nido_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_cat_income_a uuid := 'c1111111-1111-1111-1111-111111111111';
  v_cat_expense_a uuid := 'c2222222-2222-2222-2222-222222222222';
  v_cat_income_b uuid := 'c3333333-3333-3333-3333-333333333333';
  v_cat_expense_b uuid := 'c4444444-4444-4444-4444-444444444444';
  v_income_a uuid := 'd1111111-1111-1111-1111-111111111111';
  v_expense_a uuid := 'd2222222-2222-2222-2222-222222222222';
  v_split_a uuid := 'd3333333-3333-3333-3333-333333333333';
  v_rec_income_a uuid := 'd4444444-4444-4444-4444-444444444444';
  v_rec_expense_a uuid := 'd5555555-5555-5555-5555-555555555555';
  v_rec_split_a uuid := 'd6666666-6666-6666-6666-666666666666';
  v_budget_a uuid := 'd7777777-7777-7777-7777-777777777777';
  v_goal_a uuid := 'd8888888-8888-8888-8888-888888888888';
  v_contrib_a uuid := 'd9999999-9999-9999-9999-999999999999';
  v_invite_a uuid := 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_income_b uuid := 'dbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_expense_b uuid := 'dccccccc-cccc-cccc-cccc-cccccccccccc';
BEGIN
  PERFORM pg_temp.create_auth_user(v_carlos, 'carlos-rls@example.test', 'Carlos');
  PERFORM pg_temp.create_auth_user(v_diana, 'diana-rls@example.test', 'Diana');
  PERFORM pg_temp.create_auth_user(v_luis, 'luis-rls@example.test', 'Luis');

  INSERT INTO public.households (id, name, created_by)
  VALUES
    (v_nido_a, 'Nido A', v_carlos),
    (v_nido_b, 'Nido B', v_luis);

  INSERT INTO public.household_members (
    household_id, user_id, role, joined_at, left_at
  ) VALUES
    (v_nido_a, v_carlos, 'owner', timestamptz '2026-01-01 00:00:00+00', NULL),
    (v_nido_a, v_diana, 'member', timestamptz '2026-01-01 00:00:00+00', NULL),
    (v_nido_b, v_luis, 'owner', timestamptz '2026-01-01 00:00:00+00', NULL);

  INSERT INTO public.categories (
    id, household_id, name, type, created_by
  ) VALUES
    (v_cat_income_a, v_nido_a, 'Salary', 'income', v_carlos),
    (v_cat_expense_a, v_nido_a, 'Groceries', 'expense', v_carlos),
    (v_cat_income_b, v_nido_b, 'Salary', 'income', v_luis),
    (v_cat_expense_b, v_nido_b, 'Rent', 'expense', v_luis);

  INSERT INTO public.recurring_incomes (
    id, household_id, member_id, category_id, amount, frequency,
    start_date, next_occurrence, created_by
  ) VALUES (
    v_rec_income_a, v_nido_a, v_carlos, v_cat_income_a, 40000, 'monthly',
    DATE '2026-01-01', DATE '2026-02-01', v_carlos
  );

  INSERT INTO public.incomes (
    id, household_id, member_id, category_id, amount, occurred_at, created_by
  ) VALUES (
    v_income_a, v_nido_a, v_carlos, v_cat_income_a, 40000, DATE '2026-01-15', v_carlos
  );

  INSERT INTO public.recurring_expenses (
    id, household_id, category_id, amount, payer_id, scope,
    distribution_method, frequency, start_date, next_occurrence, created_by
  ) VALUES (
    v_rec_expense_a, v_nido_a, v_cat_expense_a, 100, v_carlos, 'shared',
    'equal', 'monthly', DATE '2026-01-01', DATE '2026-02-01', v_carlos
  );

  INSERT INTO public.recurring_expense_splits (
    id, recurring_expense_id, member_id, amount, percentage
  ) VALUES (
    v_rec_split_a, v_rec_expense_a, v_carlos, 100, 100
  );

  INSERT INTO public.expenses (
    id, household_id, category_id, amount, occurred_at, payer_id,
    scope, distribution_method, created_by
  ) VALUES (
    v_expense_a, v_nido_a, v_cat_expense_a, 80, DATE '2026-01-20', v_carlos,
    'personal', 'fixed', v_carlos
  );

  INSERT INTO public.expense_splits (
    id, expense_id, member_id, amount, percentage
  ) VALUES (
    v_split_a, v_expense_a, v_carlos, 80, 100
  );

  INSERT INTO public.budgets (
    id, household_id, member_id, category_id, amount, period,
    start_date, end_date, created_by
  ) VALUES (
    v_budget_a, v_nido_a, NULL, v_cat_expense_a, 500, 'monthly',
    DATE '2026-01-01', DATE '2026-01-31', v_carlos
  );

  INSERT INTO public.goals (
    id, household_id, name, goal_type, target_amount, status, created_by
  ) VALUES (
    v_goal_a, v_nido_a, 'Emergency fund', 'saving', 10000, 'active', v_carlos
  );

  INSERT INTO public.goal_contributions (
    id, goal_id, member_id, amount, contributed_at, created_by
  ) VALUES (
    v_contrib_a, v_goal_a, v_carlos, 200, DATE '2026-01-25', v_carlos
  );

  INSERT INTO public.household_invitations (
    id, household_id, invited_by, email, token, expires_at
  ) VALUES (
    v_invite_a, v_nido_a, v_carlos, 'invitee@example.test',
    'nido-rls-invite-token-a', now() + interval '7 days'
  );

  INSERT INTO public.incomes (
    id, household_id, member_id, category_id, amount, occurred_at, created_by
  ) VALUES (
    v_income_b, v_nido_b, v_luis, v_cat_income_b, 10000, DATE '2026-01-15', v_luis
  );

  INSERT INTO public.expenses (
    id, household_id, category_id, amount, occurred_at, payer_id,
    scope, distribution_method, created_by
  ) VALUES (
    v_expense_b, v_nido_b, v_cat_expense_b, 50, DATE '2026-01-20', v_luis,
    'personal', 'fixed', v_luis
  );

  INSERT INTO rls_ids (key, id) VALUES
    ('carlos', v_carlos),
    ('diana', v_diana),
    ('luis', v_luis),
    ('nido_a', v_nido_a),
    ('nido_b', v_nido_b),
    ('cat_income_a', v_cat_income_a),
    ('cat_expense_a', v_cat_expense_a),
    ('cat_income_b', v_cat_income_b),
    ('cat_expense_b', v_cat_expense_b),
    ('income_a', v_income_a),
    ('expense_a', v_expense_a),
    ('split_a', v_split_a),
    ('rec_income_a', v_rec_income_a),
    ('rec_expense_a', v_rec_expense_a),
    ('rec_split_a', v_rec_split_a),
    ('budget_a', v_budget_a),
    ('goal_a', v_goal_a),
    ('contrib_a', v_contrib_a),
    ('invite_a', v_invite_a),
    ('income_b', v_income_b),
    ('expense_b', v_expense_b);
END;
$$;

-- -----------------------------------------------------------------------------
-- Scenario A — Carlos active in Nido A
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_income_a uuid;
  v_cat_expense_a uuid;
  v_income_a uuid;
  v_expense_a uuid;
  v_budget_a uuid;
  v_goal_a uuid;
  v_new_income uuid := 'e1111111-1111-1111-1111-111111111111';
  v_new_expense uuid := 'e2222222-2222-2222-2222-222222222222';
  v_new_budget uuid := 'e3333333-3333-3333-3333-333333333333';
  v_new_goal uuid := 'e4444444-4444-4444-4444-444444444444';
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_income_a FROM rls_ids WHERE key = 'income_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';
  SELECT id INTO v_budget_a FROM rls_ids WHERE key = 'budget_a';
  SELECT id INTO v_goal_a FROM rls_ids WHERE key = 'goal_a';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'A01', 'Carlos', 'A', 'active', 'SELECT household',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.households WHERE id = %L', v_nido_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'A02', 'Carlos', 'A', 'active', 'SELECT expense',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'A03', 'Carlos', 'A', 'active', 'SELECT income',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.incomes WHERE id = %L', v_income_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'A04', 'Carlos', 'A', 'active', 'SELECT budget',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_budget_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'A05', 'Carlos', 'A', 'active', 'SELECT goal',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE id = %L', v_goal_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'A06', 'Carlos', 'A', 'active', 'INSERT expense',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          id, household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, %L, 25, DATE '2026-01-21', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_new_expense, v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'A07', 'Carlos', 'A', 'active', 'INSERT income',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.incomes (
          id, household_id, member_id, category_id, amount, occurred_at, created_by
        ) VALUES (
          %L, %L, %L, %L, 100, DATE '2026-01-21', %L
        )
      $sql$,
      v_new_income, v_nido_a, v_carlos, v_cat_income_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'A08', 'Carlos', 'A', 'active', 'UPDATE expense',
    'allow',
    pg_temp.expect_allow(format(
      'UPDATE public.expenses SET description = %L WHERE id = %L',
      'updated by carlos', v_expense_a
    ))
  );

  PERFORM pg_temp.record_result(
    'A09', 'Carlos', 'A', 'active', 'INSERT/UPDATE budget',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.budgets (
          id, household_id, member_id, category_id, amount, period,
          start_date, end_date, created_by
        ) VALUES (
          %L, %L, %L, %L, 200, 'monthly',
          DATE '2026-02-01', DATE '2026-02-28', %L
        )
      $sql$,
      v_new_budget, v_nido_a, v_carlos, v_cat_expense_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'A10', 'Carlos', 'A', 'active', 'INSERT/UPDATE goal',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.goals (
          id, household_id, name, goal_type, target_amount, created_by
        ) VALUES (
          %L, %L, 'Vacation', 'purchase', 3000, %L
        )
      $sql$,
      v_new_goal, v_nido_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'A11', 'Carlos', 'B', 'never member', 'SELECT household B',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.households WHERE id = %L', v_nido_b
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  INSERT INTO rls_ids (key, id) VALUES
    ('new_income_a', v_new_income),
    ('new_expense_a', v_new_expense),
    ('new_budget_a', v_new_budget),
    ('new_goal_a', v_new_goal);
END;
$$;

-- -----------------------------------------------------------------------------
-- Scenario B — Luis never a member of Nido A
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_expense_a uuid;
  v_expense_a uuid;
  v_income_a uuid;
  v_budget_a uuid;
  v_goal_a uuid;
  v_invite_a uuid;
BEGIN
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';
  SELECT id INTO v_income_a FROM rls_ids WHERE key = 'income_a';
  SELECT id INTO v_budget_a FROM rls_ids WHERE key = 'budget_a';
  SELECT id INTO v_goal_a FROM rls_ids WHERE key = 'goal_a';
  SELECT id INTO v_invite_a FROM rls_ids WHERE key = 'invite_a';

  PERFORM pg_temp.set_auth(v_luis);

  PERFORM pg_temp.record_result(
    'B01', 'Luis', 'A', 'never member', 'SELECT household',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.households WHERE id = %L', v_nido_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'B02', 'Luis', 'A', 'never member', 'SELECT expense',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE household_id = %L', v_nido_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'B03', 'Luis', 'A', 'never member', 'SELECT income',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.incomes WHERE household_id = %L', v_nido_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'B04', 'Luis', 'A', 'never member', 'SELECT budget',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE household_id = %L', v_nido_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'B05', 'Luis', 'A', 'never member', 'SELECT goal',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE household_id = %L', v_nido_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'B06', 'Luis', 'A', 'never member', 'SELECT invitation token',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.household_invitations WHERE id = %L', v_invite_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'B07', 'Luis', 'A', 'never member', 'INSERT expense',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 10, DATE '2026-01-22', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_luis, v_luis
    ))
  );

  PERFORM pg_temp.record_result(
    'B08', 'Luis', 'A', 'never member', 'UPDATE expense',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.expenses SET description = %L WHERE id = %L',
      'luis should fail', v_expense_a
    ))
  );

  PERFORM pg_temp.record_result(
    'B09', 'Luis', 'B', 'active', 'SELECT household B',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.households WHERE id = %L', v_nido_b
    )) = 1 THEN 'allow' ELSE 'deny' END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Scenarios E–H while Carlos is still active in A
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_expense_a uuid;
  v_cat_expense_b uuid;
  v_cat_income_a uuid;
  v_expense_a uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_cat_expense_b FROM rls_ids WHERE key = 'cat_expense_b';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'E01', 'Carlos', 'B', 'never member', 'cross-household INSERT expense',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 10, DATE '2026-01-22', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_b, v_cat_expense_b, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'F01', 'Carlos', 'A', 'active', 'INSERT split for other-household member',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
        VALUES (%L, %L, 1, 1)
      $sql$,
      v_expense_a, v_luis
    ))
  );

  PERFORM pg_temp.record_result(
    'G01', 'Carlos', 'A', 'active', 'INSERT income for other-household member',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.incomes (
          household_id, member_id, category_id, amount, occurred_at, created_by
        ) VALUES (
          %L, %L, %L, 10, DATE '2026-01-22', %L
        )
      $sql$,
      v_nido_a, v_luis, v_cat_income_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'H01', 'Carlos', 'A', 'active', 'INSERT expense with fake created_by',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 10, DATE '2026-01-22', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'H02', 'Carlos', 'A', 'active', 'INSERT income with fake created_by',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.incomes (
          household_id, member_id, category_id, amount, occurred_at, created_by
        ) VALUES (
          %L, %L, %L, 10, DATE '2026-01-22', %L
        )
      $sql$,
      v_nido_a, v_carlos, v_cat_income_a, v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'H03', 'Carlos', 'A', 'active', 'INSERT goal with fake created_by',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.goals (
          household_id, name, goal_type, target_amount, created_by
        ) VALUES (
          %L, 'Forged', 'saving', 100, %L
        )
      $sql$,
      v_nido_a, v_diana
    ))
  );
END;
$$;

-- Owner vs member restrictions while Carlos is still owner of A

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_nido_a uuid;
  v_invite_a uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_invite_a FROM rls_ids WHERE key = 'invite_a';

  PERFORM pg_temp.set_auth(v_diana);

  PERFORM pg_temp.record_result(
    'O01', 'Diana', 'A', 'active member', 'SELECT invitation',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.household_invitations WHERE id = %L', v_invite_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'O02', 'Diana', 'A', 'active member', 'INSERT invitation',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.household_invitations (
          household_id, invited_by, email, token, expires_at
        ) VALUES (
          %L, %L, 'other@example.test', 'nido-rls-invite-diana', now() + interval '1 day'
        )
      $sql$,
      v_nido_a, v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'O03', 'Diana', 'A', 'active member', 'DELETE household',
    'deny',
    pg_temp.expect_allow(format(
      'DELETE FROM public.households WHERE id = %L', v_nido_a
    ))
  );

  PERFORM pg_temp.record_result(
    'O04', 'Diana', 'A', 'active member', 'UPDATE membership role',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        UPDATE public.household_members
        SET role = 'owner'
        WHERE household_id = %L AND user_id = %L AND left_at IS NULL
      $sql$,
      v_nido_a, v_diana
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'O05', 'Carlos', 'A', 'active owner', 'SELECT invitation',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.household_invitations WHERE id = %L', v_invite_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'O06', 'Carlos', 'A', 'active owner', 'INSERT invitation',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.household_invitations (
          household_id, invited_by, email, token, expires_at
        ) VALUES (
          %L, %L, 'second@example.test', 'nido-rls-invite-carlos', now() + interval '1 day'
        )
      $sql$,
      v_nido_a, v_carlos
    ))
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.3.1 — invitation product: lookup / accept / cancel
-- Temporary users and tokens. Does not mutate invite_a.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_sofia uuid := gen_random_uuid();
  v_mateo uuid := gen_random_uuid();
  v_nido_a uuid;
  v_nido_b uuid;
  v_income_a uuid;
  v_expense_a uuid;
  v_inv_pending uuid := gen_random_uuid();
  v_inv_expired uuid := gen_random_uuid();
  v_inv_accepted uuid := gen_random_uuid();
  v_inv_cancel uuid := gen_random_uuid();
  v_inv_accept uuid := gen_random_uuid();
  v_inv_member uuid := gen_random_uuid();
  v_inv_other uuid := gen_random_uuid();
  v_suffix text := replace(v_sofia::text, '-', '');
  v_tok_pending text := 'nido-rls-j-pending-' || v_suffix;
  v_tok_expired text := 'nido-rls-j-expired-' || v_suffix;
  v_tok_accepted text := 'nido-rls-j-accepted-' || v_suffix;
  v_tok_cancel text := 'nido-rls-j-cancel-' || v_suffix;
  v_tok_accept text := 'nido-rls-j-accept-' || v_suffix;
  v_tok_member text := 'nido-rls-j-member-' || v_suffix;
  v_tok_other text := 'nido-rls-j-other-' || v_suffix;
  v_status text;
  v_name text;
  v_preview jsonb;
  v_preview_keys text[];
  v_members_before integer;
  v_members_after integer;
  v_hh_name_before text;
  v_hh_name_after text;
  v_income_before integer;
  v_income_after integer;
  v_expense_before integer;
  v_expense_after integer;
  v_accept_user uuid;
  v_accept_role public.household_role;
  v_accept_hh uuid;
  v_fn_args text;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_income_a FROM rls_ids WHERE key = 'income_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';

  PERFORM pg_temp.clear_auth();
  PERFORM pg_temp.create_auth_user(v_sofia, 'sofia-rls-' || v_suffix || '@example.test', 'Sofia');
  PERFORM pg_temp.create_auth_user(v_mateo, 'mateo-rls-' || v_suffix || '@example.test', 'Mateo');

  INSERT INTO public.household_invitations (
    id, household_id, invited_by, email, token, expires_at, accepted_at
  ) VALUES
    (v_inv_pending, v_nido_a, v_carlos, NULL, v_tok_pending, now() + interval '7 days', NULL),
    (v_inv_expired, v_nido_a, v_carlos, NULL, v_tok_expired, now() - interval '1 day', NULL),
    (v_inv_accepted, v_nido_a, v_carlos, 'accepted@example.test', v_tok_accepted, now() + interval '7 days', now() - interval '1 day'),
    (v_inv_cancel, v_nido_a, v_carlos, 'sofia-rls-' || v_suffix || '@example.test', v_tok_cancel, now() + interval '7 days', NULL),
    (v_inv_accept, v_nido_a, v_carlos, NULL, v_tok_accept, now() + interval '7 days', NULL),
    (v_inv_member, v_nido_a, v_carlos, NULL, v_tok_member, now() + interval '7 days', NULL),
    (v_inv_other, v_nido_a, v_carlos, NULL, v_tok_other, now() + interval '7 days', NULL);

  INSERT INTO rls_ids (key, id) VALUES
    ('sofia', v_sofia),
    ('mateo', v_mateo),
    ('inv_pending', v_inv_pending),
    ('inv_cancel', v_inv_cancel);

  -- J01 anon + valid token
  v_status := NULL;
  v_name := NULL;
  BEGIN
    PERFORM pg_temp.clear_auth();
    SET LOCAL ROLE anon;
    SELECT status, household_name INTO v_status, v_name
    FROM public.lookup_invitation(v_tok_pending);
    RESET ROLE;
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      v_status := 'error';
      v_name := SQLERRM;
  END;
  PERFORM pg_temp.record_result(
    'J01', 'anon', 'A', 'none', 'lookup valid token',
    'valid:Nido A',
    v_status || ':' || coalesce(v_name, '')
  );

  -- J02 authenticated (non-owner) + valid token
  PERFORM pg_temp.set_auth(v_sofia);
  SELECT status, household_name INTO v_status, v_name
  FROM public.lookup_invitation(v_tok_pending);
  PERFORM pg_temp.record_result(
    'J02', 'Sofia', 'A', 'invitee', 'lookup valid token',
    'valid:Nido A',
    v_status || ':' || coalesce(v_name, '')
  );

  -- J03 nonexistent
  SELECT status INTO v_status
  FROM public.lookup_invitation('nido-rls-j-missing-token');
  PERFORM pg_temp.record_result(
    'J03', 'Sofia', '-', 'none', 'lookup missing token',
    'invalid',
    v_status
  );

  -- J04 expired
  SELECT status INTO v_status
  FROM public.lookup_invitation(v_tok_expired);
  PERFORM pg_temp.record_result(
    'J04', 'Sofia', 'A', 'invitee', 'lookup expired token',
    'expired',
    v_status
  );

  -- J05 accepted
  SELECT status INTO v_status
  FROM public.lookup_invitation(v_tok_accepted);
  PERFORM pg_temp.record_result(
    'J05', 'Sofia', 'A', 'invitee', 'lookup accepted token',
    'accepted',
    v_status
  );

  -- J06 preview does not expose token, email, household_id, or finances
  SELECT to_jsonb(t) INTO v_preview
  FROM public.lookup_invitation(v_tok_pending) AS t;
  SELECT array_agg(key ORDER BY key) INTO v_preview_keys
  FROM jsonb_object_keys(v_preview) AS key;
  PERFORM pg_temp.record_result(
    'J06', 'Sofia', 'A', 'invitee', 'lookup preview keys only',
    'household_name,status',
    array_to_string(v_preview_keys, ',')
  );
  PERFORM pg_temp.record_result(
    'J07', 'Sofia', 'A', 'invitee', 'lookup omits token email household_id amount',
    'safe',
    CASE
      WHEN coalesce(v_preview ? 'token', false)
        OR coalesce(v_preview ? 'email', false)
        OR coalesce(v_preview ? 'household_id', false)
        OR coalesce(v_preview ? 'amount', false)
      THEN 'leaked'
      ELSE 'safe'
    END
  );

  -- J08 unauthenticated accept
  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'J08', 'none', '-', 'none', 'anon cannot accept',
    'nido.unauthenticated',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_accept
    ))
  );

  -- J11 missing token
  PERFORM pg_temp.set_auth(v_sofia);
  PERFORM pg_temp.record_result(
    'J11', 'Sofia', '-', 'none', 'accept missing token',
    'nido.invitation_invalid',
    pg_temp.expect_exception(
      'SELECT public.accept_invitation(''nido-rls-j-missing-token'')'
    )
  );

  -- J12 expired
  PERFORM pg_temp.record_result(
    'J12', 'Sofia', 'A', 'none', 'accept expired token',
    'nido.invitation_expired',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_expired
    ))
  );

  -- J13 already accepted
  PERFORM pg_temp.record_result(
    'J13', 'Sofia', 'A', 'none', 'accept already accepted token',
    'nido.invitation_accepted',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_accepted
    ))
  );

  -- J14 already in another Nido
  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'J14', 'Luis', 'A', 'other nido', 'accept while in another Nido',
    'nido.already_in_nido',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_other
    ))
  );

  -- J15 already a member of the same Nido
  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'J15', 'Diana', 'A', 'active member', 'accept while already a member',
    'nido.already_member',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_member
    ))
  );

  -- J09 / J10 authenticated accept of a valid token
  PERFORM pg_temp.set_auth(v_mateo);
  PERFORM pg_temp.record_result(
    'J09', 'Mateo', 'A', 'none', 'accept valid token',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.accept_invitation(%L)', v_tok_accept
    ))
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT user_id, role, household_id
    INTO v_accept_user, v_accept_role, v_accept_hh
  FROM public.household_members
  WHERE user_id = v_mateo AND left_at IS NULL;
  PERFORM pg_temp.record_result(
    'J10', 'Mateo', 'A', 'member after accept', 'accept uses auth.uid member role invitation household',
    'allow',
    CASE
      WHEN v_accept_user = v_mateo
       AND v_accept_role = 'member'
       AND v_accept_hh = v_nido_a
      THEN 'allow' ELSE 'deny'
    END
  );

  -- J16 second accept of the same token
  PERFORM pg_temp.set_auth(v_sofia);
  PERFORM pg_temp.record_result(
    'J16', 'Sofia', 'A', 'none', 'second accept of used token',
    'nido.invitation_accepted',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_accept
    ))
  );

  -- J17–J19 accept cannot choose household_id / role / user_id
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_fn_args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'accept_invitation';
  PERFORM pg_temp.record_result(
    'J17', 'Mateo', 'A', 'member', 'accept has no household_id argument',
    'p_token text',
    v_fn_args
  );
  PERFORM pg_temp.record_result(
    'J18', 'Mateo', 'A', 'member', 'accept has no role argument',
    'reject',
    CASE
      WHEN v_fn_args LIKE '%role%' THEN 'allow'
      ELSE 'reject'
    END
  );
  PERFORM pg_temp.record_result(
    'J19', 'Mateo', 'A', 'member', 'accept has no user_id argument',
    'reject',
    CASE
      WHEN v_fn_args LIKE '%user_id%' THEN 'allow'
      ELSE 'reject'
    END
  );
  PERFORM pg_temp.record_result(
    'J17b', 'none', '-', 'none', 'accept rejects extra household_id param',
    'reject',
    CASE
      WHEN pg_temp.expect_exception(format(
        'SELECT public.accept_invitation(p_token := %L, p_household_id := %L::uuid)',
        v_tok_pending, v_nido_b
      )) LIKE '%does not exist%' THEN 'reject'
      ELSE 'allow'
    END
  );

  -- Cancel / DELETE
  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT count(*) INTO v_members_before
  FROM public.household_members WHERE household_id = v_nido_a;
  SELECT name INTO v_hh_name_before FROM public.households WHERE id = v_nido_a;
  SELECT count(*) INTO v_income_before
  FROM public.incomes WHERE household_id = v_nido_a AND deleted_at IS NULL;
  SELECT count(*) INTO v_expense_before
  FROM public.expenses WHERE household_id = v_nido_a AND deleted_at IS NULL;

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'J21', 'Diana', 'A', 'active member', 'member cannot cancel invitation',
    'deny',
    pg_temp.expect_allow(format(
      'DELETE FROM public.household_invitations WHERE id = %L', v_inv_cancel
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'J22', 'Luis', 'B', 'other nido', 'other Nido cannot cancel invitation',
    'deny',
    pg_temp.expect_allow(format(
      'DELETE FROM public.household_invitations WHERE id = %L', v_inv_cancel
    ))
  );

  PERFORM pg_temp.set_auth(v_sofia);
  PERFORM pg_temp.record_result(
    'J23', 'Sofia', 'A', 'invitee', 'invitee cannot cancel invitation',
    'deny',
    pg_temp.expect_allow(format(
      'DELETE FROM public.household_invitations WHERE id = %L', v_inv_cancel
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'J20', 'Carlos', 'A', 'active owner', 'owner can cancel pending invitation',
    'allow',
    pg_temp.expect_allow(format(
      'DELETE FROM public.household_invitations WHERE id = %L', v_inv_cancel
    ))
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT count(*) INTO v_members_after
  FROM public.household_members WHERE household_id = v_nido_a;
  SELECT name INTO v_hh_name_after FROM public.households WHERE id = v_nido_a;
  SELECT count(*) INTO v_income_after
  FROM public.incomes WHERE household_id = v_nido_a AND deleted_at IS NULL;
  SELECT count(*) INTO v_expense_after
  FROM public.expenses WHERE household_id = v_nido_a AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'J24', 'Carlos', 'A', 'active owner', 'cancel does not create membership',
    'allow',
    CASE WHEN v_members_after = v_members_before THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'J25', 'Carlos', 'A', 'active owner', 'cancel does not modify household',
    'allow',
    CASE WHEN v_hh_name_after = v_hh_name_before THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'J26', 'Carlos', 'A', 'active owner', 'cancel does not modify finances',
    'allow',
    CASE
      WHEN v_income_after = v_income_before
       AND v_expense_after = v_expense_before
       AND pg_temp.expect_count(format(
         'SELECT count(*) FROM public.incomes WHERE id = %L', v_income_a
       )) = 1
       AND pg_temp.expect_count(format(
         'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
       )) = 1
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_sofia);
  SELECT status INTO v_status
  FROM public.lookup_invitation(v_tok_cancel);
  PERFORM pg_temp.record_result(
    'J29', 'Sofia', 'A', 'invitee', 'lookup cancelled token is invalid',
    'invalid',
    v_status
  );
  PERFORM pg_temp.record_result(
    'J30', 'Sofia', 'A', 'none', 'accept cancelled token is rejected',
    'nido.invitation_invalid',
    pg_temp.expect_exception(format(
      'SELECT public.accept_invitation(%L)', v_tok_cancel
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'J27', 'Carlos', 'A', 'active owner', 'cannot UPDATE accepted invitation',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.household_invitations SET accepted_at = NULL WHERE id = %L',
      v_inv_accepted
    ))
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'J28', 'Diana', 'A', 'active member', 'member cannot DELETE expired invitation',
    'deny',
    pg_temp.expect_allow(format(
      'DELETE FROM public.household_invitations WHERE id = %L', v_inv_expired
    ))
  );

  PERFORM pg_temp.set_auth(v_sofia);
  PERFORM pg_temp.record_result(
    'J28b', 'Sofia', 'A', 'invitee', 'invitee cannot DELETE expired invitation',
    'deny',
    pg_temp.expect_allow(format(
      'DELETE FROM public.household_invitations WHERE id = %L', v_inv_expired
    ))
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Owner transfer deny cases (Carlos still owner of A; no role change)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_eva uuid := '44444444-4444-4444-4444-444444444444';
  v_nido_a uuid;
  v_nido_b uuid;
  v_carlos_role public.household_role;
  v_diana_role public.household_role;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';

  PERFORM pg_temp.clear_auth();
  PERFORM pg_temp.create_auth_user(v_eva, 'eva-rls@example.test', 'Eva');
  INSERT INTO public.household_members (
    household_id, user_id, role, joined_at, left_at
  ) VALUES (
    v_nido_a, v_eva, 'member',
    timestamptz '2026-01-01 00:00:00+00',
    timestamptz '2026-07-01 00:00:00+00'
  );
  INSERT INTO rls_ids (key, id) VALUES ('eva', v_eva);

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'T01', 'Diana', 'A', 'active member', 'non-owner cannot transfer',
    'nido.forbidden',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_carlos
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'T02', 'Luis', 'B', 'other nido', 'other nido cannot transfer into A',
    'nido.invalid_transfer_target',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'T03', 'none', '-', 'none', 'unauthenticated cannot transfer',
    'nido.unauthenticated',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'T04', 'Carlos', 'A', 'active owner', 'cannot transfer to self',
    'nido.cannot_transfer_to_self',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'T05', 'Carlos', 'A', 'active owner', 'cannot transfer to other nido',
    'nido.invalid_transfer_target',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_luis
    ))
  );

  PERFORM pg_temp.record_result(
    'T06', 'Carlos', 'A', 'active owner', 'cannot transfer to null target',
    'nido.invalid_transfer_target',
    pg_temp.expect_exception('SELECT public.transfer_household_ownership(NULL)')
  );

  PERFORM pg_temp.record_result(
    'T07', 'Carlos', 'A', 'active owner', 'cannot client-UPDATE own role',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        UPDATE public.household_members
        SET role = 'member'
        WHERE household_id = %L AND user_id = %L AND left_at IS NULL
      $sql$,
      v_nido_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'T08', 'Carlos', 'A', 'active owner', 'cannot client-UPDATE other member role',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        UPDATE public.household_members
        SET role = 'owner'
        WHERE household_id = %L AND user_id = %L AND left_at IS NULL
      $sql$,
      v_nido_a, v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'T09', 'Carlos', 'A', 'active owner', 'last owner cannot leave without transfer',
    'nido.last_owner',
    pg_temp.expect_exception('SELECT public.leave_household()')
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'T10', 'Luis', 'B', 'last member', 'last active member cannot leave',
    'nido.last_owner',
    pg_temp.expect_exception('SELECT public.leave_household()')
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'T11', 'Carlos', 'A', 'active owner', 'cannot transfer to historical member',
    'nido.invalid_transfer_target',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_eva
    ))
  );

  PERFORM pg_temp.set_auth(v_eva);
  PERFORM pg_temp.record_result(
    'T12', 'Eva', 'A', 'historical', 'historical member cannot transfer',
    'nido.not_a_member',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );

  SELECT role INTO v_carlos_role
  FROM public.household_members
  WHERE household_id = v_nido_a AND user_id = v_carlos AND left_at IS NULL;
  SELECT role INTO v_diana_role
  FROM public.household_members
  WHERE household_id = v_nido_a AND user_id = v_diana AND left_at IS NULL;

  PERFORM pg_temp.record_result(
    'T13', 'Carlos', 'A', 'active owner', 'failed transfer is atomic (roles unchanged)',
    'allow',
    CASE
      WHEN v_carlos_role = 'owner' AND v_diana_role = 'member'
      THEN 'allow' ELSE 'deny'
    END
  );
END;
$$;

-- Child-table inheritance and profile visibility

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_split_a uuid;
  v_contrib_a uuid;
  v_rec_split_a uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_split_a FROM rls_ids WHERE key = 'split_a';
  SELECT id INTO v_contrib_a FROM rls_ids WHERE key = 'contrib_a';
  SELECT id INTO v_rec_split_a FROM rls_ids WHERE key = 'rec_split_a';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'P01', 'Carlos', 'A', 'active', 'SELECT expense_split',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_splits WHERE id = %L', v_split_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'P02', 'Carlos', 'A', 'active', 'SELECT goal_contribution',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goal_contributions WHERE id = %L', v_contrib_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'P03', 'Carlos', 'A', 'active', 'SELECT Diana profile',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.profiles WHERE id = %L', v_diana
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'P04', 'Carlos', 'B', 'never member', 'SELECT Luis profile',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.profiles WHERE id = %L', v_luis
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_luis);

  PERFORM pg_temp.record_result(
    'P05', 'Luis', 'A', 'never member', 'SELECT expense_split',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_splits WHERE id = %L', v_split_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'P06', 'Luis', 'A', 'never member', 'SELECT recurring_expense_split',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.recurring_expense_splits WHERE id = %L', v_rec_split_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'P07', 'Luis', 'A', 'never member', 'SELECT Carlos profile',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.profiles WHERE id = %L', v_carlos
    )) = 0 THEN 'deny' ELSE 'allow' END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.1.2A / 9.1.2B — expense RPCs (while Carlos is still active in A)
-- These assertions require migrations 20260821000000 and 20260821120000.
-- They are not a substitute for a live app session; they exercise Postgres
-- + RLS with set_auth().
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_expense_a uuid;
  v_cat_expense_b uuid;
  v_before integer;
  v_after integer;
  v_mutate uuid;
  v_payer_lock uuid;
  v_split_count integer;
  v_deleted_at timestamptz;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_cat_expense_b FROM rls_ids WHERE key = 'cat_expense_b';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'X01', 'Carlos', 'A', 'active', 'create_expense personal',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 25, 'Cafe', DATE '2026-08-21', %L::uuid, 'personal',
          jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 25, 'percentage', 100))
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X02', 'Carlos', 'A', 'active', 'create_expense shared with Diana',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 40, 'Cena', DATE '2026-08-21', %L::uuid, 'shared',
          jsonb_build_array(
            jsonb_build_object('member_id', %L, 'amount', 20, 'percentage', 50),
            jsonb_build_object('member_id', %L, 'amount', 20, 'percentage', 50)
          )
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos, v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'X03', 'Carlos', 'B', 'never member', 'create_expense other household',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 10, 'Cruzado', DATE '2026-08-21', %L::uuid, 'personal',
          jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 10, 'percentage', 100))
        )
      $sql$,
      v_nido_b, v_cat_expense_b, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X04', 'Carlos', 'A', 'active', 'create_expense category of other Nido',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 10, 'Categoria ajena', DATE '2026-08-21', %L::uuid, 'personal',
          jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 10, 'percentage', 100))
        )
      $sql$,
      v_nido_a, v_cat_expense_b, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X05', 'Carlos', 'A', 'active', 'create_expense split for Luis',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 10, 'Split ajeno', DATE '2026-08-21', %L::uuid, 'shared',
          jsonb_build_array(
            jsonb_build_object('member_id', %L, 'amount', 5, 'percentage', 50),
            jsonb_build_object('member_id', %L, 'amount', 5, 'percentage', 50)
          )
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos, v_luis
    ))
  );

  SELECT count(*) INTO v_before FROM public.expenses WHERE household_id = v_nido_a;

  PERFORM pg_temp.set_auth(v_carlos);
  BEGIN
    PERFORM public.create_expense(
      v_nido_a,
      v_cat_expense_a,
      12,
      'Huerfano',
      DATE '2026-08-21',
      v_carlos,
      'personal',
      jsonb_build_array(
        jsonb_build_object('member_id', v_carlos, 'amount', 7, 'percentage', 50),
        jsonb_build_object('member_id', v_diana, 'amount', 5, 'percentage', 50)
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  SELECT count(*) INTO v_after FROM public.expenses WHERE household_id = v_nido_a;

  PERFORM pg_temp.record_result(
    'X06', 'Carlos', 'A', 'active', 'invalid split leaves no orphan expense',
    'allow',
    CASE WHEN v_after = v_before THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_expense(
    v_nido_a,
    v_cat_expense_a,
    30,
    'Para editar',
    DATE '2026-08-21',
    v_carlos,
    'personal',
    jsonb_build_array(jsonb_build_object('member_id', v_carlos, 'amount', 30, 'percentage', 100))
  ) INTO v_mutate;

  PERFORM pg_temp.record_result(
    'X08', 'Carlos', 'A', 'active', 'creator can update expense',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.update_expense(
          %L::uuid, %L::uuid, 40, 'Cena editada', DATE '2026-08-21', %L::uuid, 'shared',
          jsonb_build_array(
            jsonb_build_object('member_id', %L, 'amount', 20, 'percentage', 50),
            jsonb_build_object('member_id', %L, 'amount', 20, 'percentage', 50)
          )
        )
      $sql$,
      v_mutate, v_cat_expense_a, v_carlos, v_carlos, v_diana
    ))
  );

  SELECT count(*) INTO v_split_count
  FROM public.expense_splits
  WHERE expense_id = v_mutate;

  IF v_split_count <> 2 THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'X08';
  END IF;

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'X09', 'Diana', 'A', 'active', 'non-creator cannot update',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_expense(
            %L::uuid, %L::uuid, 15, 'Diana no puede', DATE '2026-08-21', %L::uuid, 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 15, 'percentage', 100))
          )
        $sql$,
        v_mutate, v_cat_expense_a, v_diana, v_diana
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.expenses SET description = %L WHERE id = %L',
        'diana overwrite', v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'X11', 'Diana', 'A', 'active', 'non-creator cannot soft-delete',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_expense(%L::uuid)',
      v_mutate
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'X12', 'Luis', 'B', 'never member', 'other household cannot modify',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_expense(
            %L::uuid, %L::uuid, 15, 'Luis no puede', DATE '2026-08-21', %L::uuid, 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 15, 'percentage', 100))
          )
        $sql$,
        v_mutate, v_cat_expense_a, v_luis, v_luis
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_expense(%L::uuid)',
        v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'X10', 'Carlos', 'A', 'active', 'creator can soft-delete',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_expense(%L::uuid)',
      v_mutate
    ))
  );

  SELECT deleted_at, (
    SELECT count(*) FROM public.expense_splits WHERE expense_id = v_mutate
  )
  INTO v_deleted_at, v_split_count
  FROM public.expenses
  WHERE id = v_mutate;

  IF v_deleted_at IS NULL OR v_split_count <> 2 THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'X10';
  END IF;

  PERFORM pg_temp.record_result(
    'X14', 'Carlos', 'A', 'active', 'deleted expense cannot be mutated',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_expense(
            %L::uuid, %L::uuid, 12, 'Ya eliminado', DATE '2026-08-21', %L::uuid, 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 12, 'percentage', 100))
          )
        $sql$,
        v_mutate, v_cat_expense_a, v_carlos, v_carlos
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_expense(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.expenses SET description = %L WHERE id = %L',
        'after delete', v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'X15', 'Carlos', 'A', 'active', 'PostgREST INSERT own payer_id',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 11, DATE '2026-08-21', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X16', 'Carlos', 'A', 'active', 'PostgREST INSERT other member payer_id',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 11, DATE '2026-08-21', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_diana, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X17', 'Carlos', 'A', 'active', 'PostgREST INSERT other household payer_id',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 11, DATE '2026-08-21', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_luis, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X19', 'Carlos', 'A', 'active', 'PostgREST INSERT manipulated uuid',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          INSERT INTO public.expenses (
            household_id, category_id, amount, occurred_at, payer_id,
            scope, distribution_method, created_by
          ) VALUES (
            %L, %L, 11, DATE '2026-08-21', %L, 'personal', 'fixed', %L
          )
        $sql$,
        v_nido_a, v_cat_expense_a, v_carlos, v_diana
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          INSERT INTO public.expenses (
            household_id, category_id, amount, occurred_at, payer_id,
            scope, distribution_method, created_by
          ) VALUES (
            %L, %L, 11, DATE '2026-08-21',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'personal', 'fixed', %L
          )
        $sql$,
        v_nido_a, v_cat_expense_a, v_carlos
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_expense(
            %L::uuid, %L::uuid, 11, 'Payer ajeno', DATE '2026-08-21', %L::uuid, 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 11, 'percentage', 100))
          )
        $sql$,
        v_nido_a, v_cat_expense_a, v_diana, v_carlos
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'X20', 'Carlos', 'A', 'active', 'PostgREST INSERT shared own payer_id',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 22, DATE '2026-08-21', %L, 'shared', 'equal', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X21', 'Carlos', 'A', 'active', 'create_expense RPC own payer_id',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 18, 'RPC propio', DATE '2026-08-21', %L::uuid, 'personal',
          jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 18, 'percentage', 100))
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X24', 'Carlos', 'A', 'active', 'create_expense RPC other member payer_id',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 18, 'RPC otro pagador', DATE '2026-08-21', %L::uuid, 'personal',
          jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 18, 'percentage', 100))
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_diana, v_diana
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_expense(
    v_nido_a,
    v_cat_expense_a,
    19,
    'Payer lock',
    DATE '2026-08-21',
    v_carlos,
    'personal',
    jsonb_build_array(jsonb_build_object('member_id', v_carlos, 'amount', 19, 'percentage', 100))
  ) INTO v_payer_lock;

  PERFORM pg_temp.record_result(
    'X23', 'Carlos', 'A', 'active', 'PostgREST UPDATE can reattribute payer_id to household member',
    'allow',
    pg_temp.expect_allow(format(
      'UPDATE public.expenses SET payer_id = %L WHERE id = %L',
      v_diana, v_payer_lock
    ))
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'X18', 'none', '-', 'none', 'unauthenticated cannot insert expense',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          INSERT INTO public.expenses (
            household_id, category_id, amount, occurred_at, payer_id,
            scope, distribution_method, created_by
          ) VALUES (
            %L, %L, 11, DATE '2026-08-21', %L, 'personal', 'fixed', %L
          )
        $sql$,
        v_nido_a, v_cat_expense_a, v_carlos, v_carlos
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_expense(
            %L::uuid, %L::uuid, 11, 'Anon', DATE '2026-08-21', %L::uuid, 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 11, 'percentage', 100))
          )
        $sql$,
        v_nido_a, v_cat_expense_a, v_carlos, v_carlos
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Goal mutations (Phase 9.1.3A) — while Carlos is still an active member
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_goal_a uuid;
  v_mutate uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_goal_a FROM rls_ids WHERE key = 'goal_a';

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_goal(
    v_nido_a,
    'Fondo editable',
    5000,
    'saving',
    NULL,
    NULL
  ) INTO v_mutate;

  PERFORM pg_temp.record_result(
    'Y01', 'Carlos', 'A', 'active', 'create_goal',
    'allow',
    CASE WHEN v_mutate IS NOT NULL THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'Y02', 'Carlos', 'B', 'never member', 'create_goal other household',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal(
          %L::uuid, 'Ajeno', 100, 'saving', NULL, NULL
        )
      $sql$,
      v_nido_b
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'Y03', 'Carlos', 'A', 'active', 'creator can update goal',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.update_goal(
          %L::uuid, 'Fondo editado', 6000, 'saving', DATE '2027-01-01', 'Reserva'
        )
      $sql$,
      v_mutate
    ))
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'Y04', 'Diana', 'A', 'active', 'non-creator cannot update goal',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal(
            %L::uuid, 'Diana no puede', 1, 'saving', NULL, NULL
          )
        $sql$,
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goals SET name = %L WHERE id = %L',
        'diana overwrite', v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goals SET name = %L WHERE id = %L',
        'seed overwrite', v_goal_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'Y05', 'Diana', 'A', 'active', 'non-creator cannot archive goal',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.archive_goal(%L::uuid)',
      v_mutate
    ))
  );

  PERFORM pg_temp.record_result(
    'Y06', 'Diana', 'A', 'active', 'active member can create own goal',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal(
          %L::uuid, 'Meta de Diana', 800, 'purchase', NULL, NULL
        )
      $sql$,
      v_nido_a
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'Y07', 'Luis', 'A', 'never member', 'other household cannot mutate goal',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal(
            %L::uuid, 'Luis no puede', 1, 'saving', NULL, NULL
          )
        $sql$,
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.archive_goal(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_goal(
            %L::uuid, 'Luis en A', 100, 'saving', NULL, NULL
          )
        $sql$,
        v_nido_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'Y08', 'Carlos', 'A', 'active', 'creator can archive goal',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.archive_goal(%L::uuid)',
      v_mutate
    ))
  );

  PERFORM pg_temp.record_result(
    'Y09', 'Carlos', 'A', 'active', 'archived goal cannot be mutated',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal(
            %L::uuid, 'Ya archivada', 1, 'saving', NULL, NULL
          )
        $sql$,
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.archive_goal(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goals SET name = %L WHERE id = %L',
        'after archive', v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  INSERT INTO rls_ids (key, id) VALUES ('mutate_goal_a', v_mutate);
END;
$$;

-- -----------------------------------------------------------------------------
-- Goal contributions (Phase 9.1.3B) — while Carlos is still an active member
-- Any active member may contribute to an active goal of the same Nido.
-- The goal creator does not matter. Archived goals and other Nidos are denied.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_goal_a uuid;
  v_mutate uuid;
  v_diana_goal uuid;
  v_goal_b uuid;
  v_contrib uuid;
  v_contrib_mutate uuid;
  v_contrib_b uuid;
  v_arch_goal uuid;
  v_arch_contrib uuid;
  v_deleted_at timestamptz;
  v_amount numeric;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_goal_a FROM rls_ids WHERE key = 'goal_a';
  SELECT id INTO v_mutate FROM rls_ids WHERE key = 'mutate_goal_a';

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_goal_contribution(
    v_goal_a,
    300,
    DATE '2026-08-21'
  ) INTO v_contrib;

  PERFORM pg_temp.record_result(
    'Z01', 'Carlos', 'A', 'active', 'create_goal_contribution own goal',
    'allow',
    CASE WHEN v_contrib IS NOT NULL THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'Z02', 'Diana', 'A', 'active', 'contribute to goal created by Carlos',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 150, DATE '2026-08-21'
        )
      $sql$,
      v_goal_a
    ))
  );

  SELECT id INTO v_diana_goal
  FROM public.goals
  WHERE household_id = v_nido_a
    AND created_by = v_diana
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'Z03', 'Carlos', 'A', 'active', 'contribute to goal created by Diana',
    'allow',
    CASE
      WHEN v_diana_goal IS NOT NULL
        AND pg_temp.expect_allow(format(
          $sql$
            SELECT public.create_goal_contribution(
              %L::uuid, 80, DATE '2026-08-21'
            )
          $sql$,
          v_diana_goal
        )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_luis);
  SELECT public.create_goal(
    v_nido_b,
    'Meta B',
    100,
    'saving',
    NULL,
    NULL
  ) INTO v_goal_b;

  PERFORM pg_temp.record_result(
    'Z04', 'Luis', 'A', 'never member', 'create_goal_contribution other Nido',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 10, DATE '2026-08-21'
        )
      $sql$,
      v_goal_a
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'Z05', 'Carlos', 'B', 'never member', 'create_goal_contribution other household goal',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 10, DATE '2026-08-21'
        )
      $sql$,
      v_goal_b
    ))
  );

  PERFORM pg_temp.record_result(
    'Z06', 'Carlos', 'A', 'active', 'create_goal_contribution archived goal',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 10, DATE '2026-08-21'
        )
      $sql$,
      v_mutate
    ))
  );

  PERFORM pg_temp.record_result(
    'Z07', 'Carlos', 'A', 'active', 'INSERT contribution for another member',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.goal_contributions (
          goal_id, member_id, amount, contributed_at, created_by
        ) VALUES (
          %L, %L, 10, DATE '2026-08-21', %L
        )
      $sql$,
      v_goal_a, v_diana, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'Z08', 'Carlos', 'A', 'active', 'contribution exceeding target',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 20000, DATE '2026-08-21'
        )
      $sql$,
      v_goal_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Z09', 'Carlos', 'A', 'active', 'create_goal_contribution missing goal',
    'deny',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_goal_contribution(
          '00000000-0000-0000-0000-000000000001'::uuid,
          10,
          DATE '2026-08-21'
        )
      $sql$
    )
  );

  -- -------------------------------------------------------------------------
  -- Contribution edit / soft-delete (Phase 9.1.3D) — while Carlos is active
  -- -------------------------------------------------------------------------

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_goal_contribution(
    v_goal_a,
    25,
    DATE '2026-08-20'
  ) INTO v_contrib_mutate;

  PERFORM pg_temp.record_result(
    'Z12', 'Carlos', 'A', 'active', 'creator can update contribution',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.update_goal_contribution(
          %L::uuid, 35, DATE '2026-08-21'
        )
      $sql$,
      v_contrib_mutate
    ))
  );

  SELECT amount INTO v_amount
  FROM public.goal_contributions
  WHERE id = v_contrib_mutate;

  IF v_amount IS DISTINCT FROM 35 THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'Z12';
  END IF;

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'Z13', 'Diana', 'A', 'active', 'non-creator cannot update contribution',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal_contribution(
            %L::uuid, 15, DATE '2026-08-21'
          )
        $sql$,
        v_contrib_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goal_contributions SET amount = 15 WHERE id = %L',
        v_contrib_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'Z14', 'Diana', 'A', 'active', 'non-creator cannot delete contribution',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        'SELECT public.soft_delete_goal_contribution(%L::uuid)',
        v_contrib_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goal_contributions SET deleted_at = now() WHERE id = %L',
        v_contrib_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'Z15', 'Luis', 'B', 'never member', 'other household cannot modify contribution',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal_contribution(
            %L::uuid, 15, DATE '2026-08-21'
          )
        $sql$,
        v_contrib_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_goal_contribution(%L::uuid)',
        v_contrib_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  SELECT public.create_goal_contribution(
    v_goal_b,
    12,
    DATE '2026-08-21'
  ) INTO v_contrib_b;

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'Z19', 'Carlos', 'B', 'never member', 'other Nido goal_id does not authorize',
    'deny',
    CASE
      WHEN v_contrib_b IS NOT NULL
        AND pg_temp.expect_allow(format(
          $sql$
            SELECT public.update_goal_contribution(
              %L::uuid, 20, DATE '2026-08-21'
            )
          $sql$,
          v_contrib_b
        )) = 'deny'
        AND pg_temp.expect_allow(format(
          'SELECT public.soft_delete_goal_contribution(%L::uuid)',
          v_contrib_b
        )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  SELECT public.create_goal(
    v_nido_a,
    'Para archivar con aportación',
    100,
    'saving',
    NULL,
    NULL
  ) INTO v_arch_goal;

  SELECT public.create_goal_contribution(
    v_arch_goal,
    10,
    DATE '2026-08-21'
  ) INTO v_arch_contrib;

  PERFORM public.archive_goal(v_arch_goal);

  PERFORM pg_temp.record_result(
    'Z18', 'Carlos', 'A', 'active', 'archived goal does not accept contribution mutations',
    'deny',
    CASE
      WHEN v_arch_contrib IS NOT NULL
        AND pg_temp.expect_allow(format(
          $sql$
            SELECT public.update_goal_contribution(
              %L::uuid, 20, DATE '2026-08-21'
            )
          $sql$,
          v_arch_contrib
        )) = 'deny'
        AND pg_temp.expect_allow(format(
          'SELECT public.soft_delete_goal_contribution(%L::uuid)',
          v_arch_contrib
        )) = 'deny'
        AND pg_temp.expect_allow(format(
          'UPDATE public.goal_contributions SET amount = 20 WHERE id = %L',
          v_arch_contrib
        )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'Z16', 'Carlos', 'A', 'active', 'creator can soft-delete contribution',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_goal_contribution(%L::uuid)',
      v_contrib_mutate
    ))
  );

  SELECT deleted_at INTO v_deleted_at
  FROM public.goal_contributions
  WHERE id = v_contrib_mutate;

  IF v_deleted_at IS NULL THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'Z16';
  END IF;

  PERFORM pg_temp.record_result(
    'Z17', 'Carlos', 'A', 'active', 'deleted contribution cannot be mutated',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal_contribution(
            %L::uuid, 12, DATE '2026-08-21'
          )
        $sql$,
        v_contrib_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_goal_contribution(%L::uuid)',
        v_contrib_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goal_contributions SET amount = 12 WHERE id = %L',
        v_contrib_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'Z11', 'none', '-', 'none', 'create_goal_contribution unauthenticated',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 10, DATE '2026-08-21'
        )
      $sql$,
      v_goal_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Z20', 'none', '-', 'none', 'update/delete contribution unauthenticated',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal_contribution(
            %L::uuid, 10, DATE '2026-08-21'
          )
        $sql$,
        v_contrib
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_goal_contribution(%L::uuid)',
        v_contrib
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.clear_auth();
END;
$$;

-- -----------------------------------------------------------------------------
-- Income mutations (Phase 9.1.3C) — while Carlos is still an active member
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_income_a uuid;
  v_cat_income_b uuid;
  v_cat_expense_a uuid;
  v_mutate uuid;
  v_deleted_at timestamptz;
  v_live_sum numeric;
  v_all_sum numeric;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_cat_income_b FROM rls_ids WHERE key = 'cat_income_b';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'I01', 'Carlos', 'A', 'active', 'create_income',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_income(
          %L::uuid, %L::uuid, 80, 'Freelance', DATE '2026-08-21'
        )
      $sql$,
      v_nido_a, v_cat_income_a
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_income(
    v_nido_a,
    v_cat_income_a,
    90,
    'Para editar',
    DATE '2026-08-21'
  ) INTO v_mutate;

  PERFORM pg_temp.record_result(
    'I02', 'Carlos', 'A', 'active', 'creator can update income',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.update_income(
          %L::uuid, %L::uuid, 95, 'Freelance editado', DATE '2026-08-21'
        )
      $sql$,
      v_mutate, v_cat_income_a
    ))
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'I04', 'Diana', 'A', 'active', 'non-creator cannot update',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_income(
            %L::uuid, %L::uuid, 15, 'Diana no puede', DATE '2026-08-21'
          )
        $sql$,
        v_mutate, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.incomes SET description = %L WHERE id = %L',
        'diana overwrite', v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'I05', 'Diana', 'A', 'active', 'non-creator cannot soft-delete',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_income(%L::uuid)',
      v_mutate
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'I06', 'Luis', 'B', 'never member', 'other household cannot access or mutate',
    'deny',
    CASE
      WHEN pg_temp.expect_count(format(
        'SELECT count(*) FROM public.incomes WHERE id = %L', v_mutate
      )) = 0
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_income(
            %L::uuid, %L::uuid, 15, 'Luis no puede', DATE '2026-08-21'
          )
        $sql$,
        v_mutate, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_income(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_income(
            %L::uuid, %L::uuid, 10, 'Cruzado', DATE '2026-08-21'
          )
        $sql$,
        v_nido_a, v_cat_income_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'I11', 'Carlos', 'A', 'active', 'manipulated uuid/household does not authorize',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_income(
            %L::uuid, %L::uuid, 10, 'Otro nido', DATE '2026-08-21'
          )
        $sql$,
        v_nido_b, v_cat_income_b
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_income(
            %L::uuid, %L::uuid, 10, 'Categoria ajena', DATE '2026-08-21'
          )
        $sql$,
        v_nido_a, v_cat_income_b
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_income(
            %L::uuid, %L::uuid, 10, 'Tipo gasto', DATE '2026-08-21'
          )
        $sql$,
        v_nido_a, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_income(
            %L::uuid, %L::uuid, 10, 'Fake id', DATE '2026-08-21'
          )
        $sql$,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_cat_income_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'I10', 'none', '-', 'none', 'unauthenticated cannot mutate',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_income(
            %L::uuid, %L::uuid, 10, 'Anon', DATE '2026-08-21'
          )
        $sql$,
        v_nido_a, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_income(
            %L::uuid, %L::uuid, 10, 'Anon', DATE '2026-08-21'
          )
        $sql$,
        v_mutate, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_income(%L::uuid)',
        v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'I03', 'Carlos', 'A', 'active', 'creator can soft-delete',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_income(%L::uuid)',
      v_mutate
    ))
  );

  SELECT deleted_at INTO v_deleted_at
  FROM public.incomes
  WHERE id = v_mutate;

  IF v_deleted_at IS NULL THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'I03';
  END IF;

  PERFORM pg_temp.record_result(
    'I12', 'Carlos', 'A', 'active', 'deleted income cannot be mutated',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_income(
            %L::uuid, %L::uuid, 12, 'Ya eliminado', DATE '2026-08-21'
          )
        $sql$,
        v_mutate, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_income(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.incomes SET description = %L WHERE id = %L',
        'after delete', v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  SELECT
    coalesce(sum(amount) FILTER (WHERE deleted_at IS NULL), 0),
    coalesce(sum(amount), 0)
  INTO v_live_sum, v_all_sum
  FROM public.incomes
  WHERE id = v_mutate;

  PERFORM pg_temp.record_result(
    'I13', 'Carlos', 'A', 'active', 'deleted income excluded from calculations',
    'allow',
    CASE
      WHEN v_deleted_at IS NOT NULL
       AND v_live_sum = 0
       AND v_all_sum = 95
      THEN 'allow'
      ELSE 'deny'
    END
  );

  INSERT INTO rls_ids (key, id) VALUES ('income_mutate_a', v_mutate);
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.1.4 — budget mutations (K01–K16)
-- Prefix K is used because B01–B09 already cover Luis / never-member
-- and P01–P07 already cover child-table SELECT / profile visibility.
-- Mapping to the requested B01–B16 cases is 1:1 (K01=create, …, K16=templates).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_income_a uuid;
  v_cat_expense_a uuid;
  v_cat_expense_b uuid;
  v_budget_a uuid;
  v_expense_a uuid;
  v_expense_b uuid;
  v_rec_expense_a uuid;
  v_mutate uuid;
  v_spent_expense uuid;
  v_deleted_at timestamptz;
  v_live_sum numeric;
  v_all_sum numeric;
  v_spent_live numeric;
  v_spent_all numeric;
  v_a_spent numeric;
  v_recurring_amount numeric;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_cat_expense_b FROM rls_ids WHERE key = 'cat_expense_b';
  SELECT id INTO v_budget_a FROM rls_ids WHERE key = 'budget_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';
  SELECT id INTO v_expense_b FROM rls_ids WHERE key = 'expense_b';
  SELECT id INTO v_rec_expense_a FROM rls_ids WHERE key = 'rec_expense_a';

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_budget(
    v_nido_a,
    v_cat_expense_a,
    800,
    DATE '2026-08-01',
    DATE '2026-08-31'
  ) INTO v_mutate;

  PERFORM pg_temp.record_result(
    'K01', 'Carlos', 'A', 'active', 'create_budget',
    'allow',
    CASE WHEN v_mutate IS NOT NULL THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'K02', 'Carlos', 'A', 'active', 'creator can update budget',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.update_budget(
          %L::uuid, %L::uuid, 850, DATE '2026-08-01', DATE '2026-08-31'
        )
      $sql$,
      v_mutate, v_cat_expense_a
    ))
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'K04', 'Diana', 'A', 'active', 'non-creator cannot update',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_budget(
            %L::uuid, %L::uuid, 15, DATE '2026-08-01', DATE '2026-08-31'
          )
        $sql$,
        v_mutate, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.budgets SET amount = 15 WHERE id = %L',
        v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'K05', 'Diana', 'A', 'active', 'non-creator cannot soft-delete',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_budget(%L::uuid)',
      v_mutate
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'K06', 'Luis', 'B', 'never member', 'other household cannot access or mutate',
    'deny',
    CASE
      WHEN pg_temp.expect_count(format(
        'SELECT count(*) FROM public.budgets WHERE id = %L', v_mutate
      )) = 0
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_budget(
            %L::uuid, %L::uuid, 15, DATE '2026-08-01', DATE '2026-08-31'
          )
        $sql$,
        v_mutate, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_budget(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-08-01', DATE '2026-08-31'
          )
        $sql$,
        v_nido_a, v_cat_expense_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'K11', 'Carlos', 'A', 'active', 'manipulated uuid/household/category does not authorize',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-09-01', DATE '2026-09-30'
          )
        $sql$,
        v_nido_b, v_cat_expense_b
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-09-01', DATE '2026-09-30'
          )
        $sql$,
        v_nido_a, v_cat_expense_b
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-09-01', DATE '2026-09-30'
          )
        $sql$,
        v_nido_a, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-08-01', DATE '2026-08-31'
          )
        $sql$,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_cat_expense_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'K10', 'none', '-', 'none', 'unauthenticated cannot mutate',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-09-01', DATE '2026-09-30'
          )
        $sql$,
        v_nido_a, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_budget(
            %L::uuid, %L::uuid, 10, DATE '2026-08-01', DATE '2026-08-31'
          )
        $sql$,
        v_mutate, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_budget(%L::uuid)',
        v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_expense(
    v_nido_a,
    v_cat_expense_a,
    25,
    'Para presupuesto',
    DATE '2026-08-10',
    v_carlos,
    'personal',
    jsonb_build_array(jsonb_build_object('member_id', v_carlos, 'amount', 25, 'percentage', 100))
  ) INTO v_spent_expense;

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'K15', 'Carlos', 'A', 'active', 'deleted expense excluded from budget spent',
    'allow',
    CASE
      WHEN v_spent_expense IS NOT NULL
       AND pg_temp.expect_allow(format(
         'SELECT public.soft_delete_expense(%L::uuid)',
         v_spent_expense
       )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.clear_auth();

  SELECT deleted_at INTO v_deleted_at
  FROM public.expenses
  WHERE id = v_spent_expense;

  SELECT coalesce(sum(amount), 0)
  INTO v_spent_live
  FROM public.expenses
  WHERE id = v_spent_expense
    AND deleted_at IS NULL;

  IF v_deleted_at IS NULL OR v_spent_live <> 0 THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'K15';
  END IF;

  SELECT coalesce(sum(amount), 0)
  INTO v_a_spent
  FROM public.expenses
  WHERE household_id = v_nido_a
    AND category_id = v_cat_expense_a
    AND deleted_at IS NULL
    AND occurred_at BETWEEN DATE '2026-01-01' AND DATE '2026-01-31';

  SELECT amount INTO v_recurring_amount
  FROM public.recurring_expenses
  WHERE id = v_rec_expense_a;

  PERFORM pg_temp.record_result(
    'K14', 'Carlos', 'A', 'active', 'other household expense excluded from budget spent',
    'allow',
    CASE
      WHEN (
        SELECT household_id FROM public.expenses WHERE id = v_expense_b
      ) = v_nido_b
      AND v_nido_b IS DISTINCT FROM v_nido_a
      AND (
        SELECT coalesce(sum(amount), 0)
        FROM public.expenses
        WHERE household_id = v_nido_a
          AND category_id = v_cat_expense_a
          AND deleted_at IS NULL
          AND occurred_at BETWEEN DATE '2026-01-01' AND DATE '2026-01-31'
          AND id = v_expense_b
      ) = 0
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.record_result(
    'K16', 'Carlos', 'A', 'active', 'recurring_expense template excluded from budget spent',
    'allow',
    CASE
      WHEN v_recurring_amount = 100
      AND NOT EXISTS (
        SELECT 1 FROM public.expenses WHERE id = v_rec_expense_a
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.expenses
        WHERE household_id = v_nido_a
          AND recurring_id = v_rec_expense_a
          AND deleted_at IS NULL
          AND occurred_at BETWEEN DATE '2026-01-01' AND DATE '2026-01-31'
      )
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'K03', 'Carlos', 'A', 'active', 'creator can soft-delete',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.soft_delete_budget(%L::uuid)',
      v_mutate
    ))
  );

  SELECT deleted_at INTO v_deleted_at
  FROM public.budgets
  WHERE id = v_mutate;

  IF v_deleted_at IS NULL THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'K03';
  END IF;

  PERFORM pg_temp.record_result(
    'K12', 'Carlos', 'A', 'active', 'deleted budget cannot be mutated',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_budget(
            %L::uuid, %L::uuid, 12, DATE '2026-08-01', DATE '2026-08-31'
          )
        $sql$,
        v_mutate, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_budget(%L::uuid)',
        v_mutate
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.budgets SET amount = 12 WHERE id = %L',
        v_mutate
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  SELECT
    coalesce(sum(amount) FILTER (WHERE deleted_at IS NULL), 0),
    coalesce(sum(amount), 0)
  INTO v_live_sum, v_all_sum
  FROM public.budgets
  WHERE id = v_mutate;

  PERFORM pg_temp.record_result(
    'K13', 'Carlos', 'A', 'active', 'deleted budget excluded from calculations',
    'allow',
    CASE
      WHEN v_deleted_at IS NOT NULL
       AND v_live_sum = 0
       AND v_all_sum = 850
      THEN 'allow'
      ELSE 'deny'
    END
  );

  INSERT INTO rls_ids (key, id) VALUES ('budget_mutate_a', v_mutate);
END;
$$;

-- Phase 9.1.5 — recurrencias (RE01–RE14)
-- Prefix RE because R01 already exists as the membership-helper smoke test.
-- Mapping: RE01=create, RE02=non-creator edit, RE03=creator edit, RE04=other
-- household, RE06=unauthenticated, RE08=manipulated uuid, RE09=pause/resume,
-- RE10=authorized materialize, RE11=other Nido materialize, RE12=inactive,
-- RE13=duplicate period, RE14=unique index / concurrent second insert.
-- RE05/RE07/RE15/RE16 run after transfer/leave below.

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_income_a uuid;
  v_cat_expense_a uuid;
  v_cat_income_b uuid;
  v_cat_expense_b uuid;
  v_rec_income uuid;
  v_rec_expense uuid;
  v_rec_future uuid;
  v_income_id uuid;
  v_expense_id uuid;
  v_income_again uuid;
  v_expense_again uuid;
  v_income_count integer;
  v_expense_count integer;
  v_template_incomes integer;
  v_is_active boolean;
  v_next date;
  v_dup text;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_cat_income_b FROM rls_ids WHERE key = 'cat_income_b';
  SELECT id INTO v_cat_expense_b FROM rls_ids WHERE key = 'cat_expense_b';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'RE01', 'Carlos', 'A', 'active', 'creator creates recurring income and expense',
    'allow',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_recurring_income(
            %L::uuid, %L::uuid, 40000, 'Sueldo plantilla',
            DATE '2026-08-01', 'monthly', NULL
          )
        $sql$,
        v_nido_a, v_cat_income_a
      )) = 'allow'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_recurring_expense(
            %L::uuid, %L::uuid, 800, 'Renta plantilla',
            DATE '2026-08-01', 'monthly', NULL, 'shared',
            '[{"member_id":"%s","amount":400,"percentage":50},{"member_id":"%s","amount":400,"percentage":50}]'::jsonb
          )
        $sql$,
        v_nido_a, v_cat_expense_a, v_carlos, v_diana
      )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  SELECT id INTO v_rec_income
  FROM public.recurring_incomes
  WHERE household_id = v_nido_a AND description = 'Sueldo plantilla'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT id INTO v_rec_expense
  FROM public.recurring_expenses
  WHERE household_id = v_nido_a AND description = 'Renta plantilla'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT count(*) INTO v_template_incomes
  FROM public.incomes
  WHERE recurring_id = v_rec_income AND deleted_at IS NULL;

  SELECT count(*) INTO v_expense_count
  FROM public.expenses
  WHERE recurring_id = v_rec_expense AND deleted_at IS NULL;

  IF v_rec_income IS NULL OR v_rec_expense IS NULL
     OR v_template_incomes <> 0 OR v_expense_count <> 0 THEN
    UPDATE rls_test_results
    SET actual = 'deny', passed = false
    WHERE test_id = 'RE01';
  END IF;

  INSERT INTO rls_ids (key, id) VALUES
    ('rec_income_mutate_a', v_rec_income),
    ('rec_expense_mutate_a', v_rec_expense);

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'RE02', 'Diana', 'A', 'active', 'non-creator cannot edit',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_income(
            %L::uuid, %L::uuid, 10, 'Diana no puede', 'monthly', NULL
          )
        $sql$,
        v_rec_income, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_expense(
            %L::uuid, %L::uuid, 10, 'Diana no puede', 'monthly', NULL, 'personal',
            '[{"member_id":"%s","amount":10,"percentage":100}]'::jsonb
          )
        $sql$,
        v_rec_expense, v_cat_expense_a, v_diana
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.recurring_incomes SET amount = 1 WHERE id = %L',
        v_rec_income
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'RE03', 'Carlos', 'A', 'active', 'creator can edit',
    'allow',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_income(
            %L::uuid, %L::uuid, 41000, 'Sueldo plantilla', 'monthly', NULL
          )
        $sql$,
        v_rec_income, v_cat_income_a
      )) = 'allow'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_expense(
            %L::uuid, %L::uuid, 900, 'Renta plantilla', 'monthly', NULL, 'shared',
            '[{"member_id":"%s","amount":450,"percentage":50},{"member_id":"%s","amount":450,"percentage":50}]'::jsonb
          )
        $sql$,
        v_rec_expense, v_cat_expense_a, v_carlos, v_diana
      )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'RE04', 'Luis', 'B', 'never member', 'other household cannot access or mutate',
    'deny',
    CASE
      WHEN pg_temp.expect_count(format(
        'SELECT count(*) FROM public.recurring_incomes WHERE id = %L', v_rec_income
      )) = 0
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_recurring_income(
            %L::uuid, %L::uuid, 10, 'Cruzado', DATE '2026-08-01', 'weekly', NULL
          )
        $sql$,
        v_nido_a, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.materialize_recurring_income(%L::uuid, DATE '2026-08-01')
        $sql$,
        v_rec_income
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'RE06', 'none', '-', 'none', 'unauthenticated cannot mutate',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_recurring_income(
            %L::uuid, %L::uuid, 10, 'Anon', DATE '2026-08-01', 'weekly', NULL
          )
        $sql$,
        v_nido_a, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.materialize_recurring_expense(%L::uuid, DATE '2026-08-01')
        $sql$,
        v_rec_expense
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'RE08', 'Carlos', 'A', 'active', 'manipulated uuid/household does not authorize',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.create_recurring_income(
            %L::uuid, %L::uuid, 10, 'Otro nido', DATE '2026-08-01', 'weekly', NULL
          )
        $sql$,
        v_nido_b, v_cat_income_b
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_income(
            %L::uuid, %L::uuid, 10, 'Fake', 'weekly', NULL
          )
        $sql$,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.materialize_recurring_income(
            %L::uuid, DATE '2026-08-01'
          )
        $sql$,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'RE09', 'Carlos', 'A', 'active', 'creator can pause and reactivate',
    'allow',
    CASE
      WHEN pg_temp.expect_allow(format(
        'SELECT public.set_recurring_income_active(%L::uuid, false)', v_rec_income
      )) = 'allow'
      AND pg_temp.expect_allow(format(
        'SELECT public.set_recurring_expense_active(%L::uuid, false)', v_rec_expense
      )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  SELECT is_active INTO v_is_active FROM public.recurring_incomes WHERE id = v_rec_income;
  IF v_is_active IS DISTINCT FROM false THEN
    UPDATE rls_test_results SET actual = 'deny', passed = false WHERE test_id = 'RE09';
  END IF;

  PERFORM pg_temp.record_result(
    'RE12', 'Carlos', 'A', 'active', 'paused template cannot materialize',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.materialize_recurring_income(%L::uuid, DATE ''2026-08-01'')',
      v_rec_income
    ))
  );

  PERFORM pg_temp.record_result(
    'RE09B', 'Carlos', 'A', 'active', 'reactivate after pause',
    'allow',
    CASE
      WHEN pg_temp.expect_allow(format(
        'SELECT public.set_recurring_income_active(%L::uuid, true)', v_rec_income
      )) = 'allow'
      AND pg_temp.expect_allow(format(
        'SELECT public.set_recurring_expense_active(%L::uuid, true)', v_rec_expense
      )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_recurring_income(
    v_nido_a, v_cat_income_a, 100, 'Futuro', DATE '2026-12-01', 'monthly', NULL
  ) INTO v_rec_future;

  PERFORM pg_temp.record_result(
    'RE12B', 'Carlos', 'A', 'active', 'future occurrence cannot materialize',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.materialize_recurring_income(%L::uuid, DATE ''2026-12-01'')',
      v_rec_future
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.materialize_recurring_income(v_rec_income, DATE '2026-08-01')
  INTO v_income_id;
  SELECT public.materialize_recurring_expense(v_rec_expense, DATE '2026-08-01')
  INTO v_expense_id;

  PERFORM pg_temp.record_result(
    'RE10', 'Carlos', 'A', 'active', 'authorized materialize creates live movements',
    'allow',
    CASE
      WHEN v_income_id IS NOT NULL
       AND v_expense_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.incomes
         WHERE id = v_income_id AND recurring_id = v_rec_income AND deleted_at IS NULL
       )
       AND EXISTS (
         SELECT 1 FROM public.expenses
         WHERE id = v_expense_id AND recurring_id = v_rec_expense AND deleted_at IS NULL
       )
       AND (
         SELECT count(*) FROM public.expense_splits WHERE expense_id = v_expense_id
       ) = 2
      THEN 'allow'
      ELSE 'deny'
    END
  );

  SELECT next_occurrence INTO v_next
  FROM public.recurring_incomes WHERE id = v_rec_income;
  IF v_next IS DISTINCT FROM DATE '2026-09-01' THEN
    UPDATE rls_test_results SET actual = 'deny', passed = false WHERE test_id = 'RE10';
  END IF;

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'RE11', 'Luis', 'B', 'never member', 'cannot materialize another Nido',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.materialize_recurring_expense(%L::uuid, DATE ''2026-09-01'')',
      v_rec_expense
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.materialize_recurring_income(v_rec_income, DATE '2026-08-01')
  INTO v_income_again;
  SELECT public.materialize_recurring_expense(v_rec_expense, DATE '2026-08-01')
  INTO v_expense_again;

  SELECT count(*) INTO v_income_count
  FROM public.incomes
  WHERE recurring_id = v_rec_income AND deleted_at IS NULL AND occurred_at = DATE '2026-08-01';

  SELECT count(*) INTO v_expense_count
  FROM public.expenses
  WHERE recurring_id = v_rec_expense AND deleted_at IS NULL AND occurred_at = DATE '2026-08-01';

  PERFORM pg_temp.record_result(
    'RE13', 'Carlos', 'A', 'active', 'same period is idempotent',
    'allow',
    CASE
      WHEN v_income_again = v_income_id
       AND v_expense_again = v_expense_id
       AND v_income_count = 1
       AND v_expense_count = 1
      THEN 'allow'
      ELSE 'deny'
    END
  );

  v_dup := pg_temp.expect_allow(format(
    $sql$
      INSERT INTO public.incomes (
        household_id, member_id, category_id, amount, occurred_at, recurring_id, created_by
      ) VALUES (
        %L, %L, %L, 1, DATE '2026-08-01', %L, %L
      )
    $sql$,
    v_nido_a, v_carlos, v_cat_income_a, v_rec_income, v_carlos
  ));

  PERFORM pg_temp.record_result(
    'RE14', 'Carlos', 'A', 'active', 'unique index rejects a concurrent second row',
    'deny',
    v_dup
  );
END;
$$;

-- Scenario C — Carlos transfers ownership to Diana, then leaves Nido A.
-- Transfer + leave use the product RPCs under auth.uid(). Direct client
-- UPDATE on household_members remains denied (T07/T08).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_nido_a uuid;
  v_invite_a uuid;
  v_expense_a uuid;
  v_created_by uuid;
  v_carlos_role public.household_role;
  v_diana_role public.household_role;
  v_carlos_left timestamptz;
  v_owner_count integer;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_invite_a FROM rls_ids WHERE key = 'invite_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'T20', 'Carlos', 'A', 'active owner', 'owner can transfer to active member',
    'allow',
    pg_temp.expect_allow(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );

  SELECT role INTO v_carlos_role
  FROM public.household_members
  WHERE household_id = v_nido_a AND user_id = v_carlos AND left_at IS NULL;
  SELECT role INTO v_diana_role
  FROM public.household_members
  WHERE household_id = v_nido_a AND user_id = v_diana AND left_at IS NULL;
  SELECT created_by INTO v_created_by
  FROM public.households
  WHERE id = v_nido_a;

  PERFORM pg_temp.record_result(
    'T21', 'Carlos', 'A', 'member after transfer', 'atomic owner transition',
    'allow',
    CASE
      WHEN v_carlos_role = 'member'
       AND v_diana_role = 'owner'
       AND v_created_by = v_carlos
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'RE15', 'Carlos', 'A', 'member after transfer', 'creator can still mutate after transferring ownership',
    'allow',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_income(
            (SELECT id FROM rls_ids WHERE key = 'rec_income_mutate_a'),
            (SELECT id FROM rls_ids WHERE key = 'cat_income_a'),
            41000, 'Sueldo plantilla', 'monthly', NULL
          )
        $sql$
      )) = 'allow'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.set_recurring_expense_active(
            (SELECT id FROM rls_ids WHERE key = 'rec_expense_mutate_a'),
            true
          )
        $sql$
      )) = 'allow'
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.record_result(
    'T22', 'Carlos', 'A', 'member after transfer', 'former owner loses invitation SELECT',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.household_invitations WHERE id = %L', v_invite_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'T24', 'Carlos', 'A', 'member after transfer', 'former owner cannot transfer',
    'nido.forbidden',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'T27', 'Carlos', 'A', 'member after transfer', 'expense history unchanged',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L AND created_by = %L AND deleted_at IS NULL',
      v_expense_a, v_carlos
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'T23', 'Diana', 'A', 'owner after transfer', 'new owner can SELECT invitation',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.household_invitations WHERE id = %L', v_invite_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'T25', 'Diana', 'A', 'owner after transfer', 'new owner cannot transfer to self',
    'nido.cannot_transfer_to_self',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'T28', 'Diana', 'A', 'owner after transfer', 'new owner cannot update Carlos expense',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.expenses SET description = %L WHERE id = %L',
      'owner overwrite', v_expense_a
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'T26', 'Carlos', 'A', 'member after transfer', 'former owner can leave',
    'allow',
    pg_temp.expect_allow('SELECT public.leave_household()')
  );

  SELECT left_at INTO v_carlos_left
  FROM public.household_members
  WHERE household_id = v_nido_a AND user_id = v_carlos;
  SELECT count(*) INTO v_owner_count
  FROM public.household_members
  WHERE household_id = v_nido_a AND role = 'owner' AND left_at IS NULL;

  PERFORM pg_temp.record_result(
    'T29', 'Diana', 'A', 'owner', 'nido still has an owner after leave',
    'allow',
    CASE
      WHEN v_carlos_left IS NOT NULL AND v_owner_count = 1
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.record_result(
    'T30', 'Carlos', 'A', 'left', 'historical member cannot transfer',
    'nido.not_a_member',
    pg_temp.expect_exception(format(
      'SELECT public.transfer_household_ownership(%L::uuid)', v_diana
    ))
  );
END;
$$;

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_nido_a uuid;
  v_cat_income_a uuid;
  v_cat_expense_a uuid;
  v_income_a uuid;
  v_expense_a uuid;
  v_budget_a uuid;
  v_goal_a uuid;
  v_contrib_a uuid;
  v_rec_income_a uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_income_a FROM rls_ids WHERE key = 'income_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';
  SELECT id INTO v_budget_a FROM rls_ids WHERE key = 'budget_a';
  SELECT id INTO v_goal_a FROM rls_ids WHERE key = 'goal_a';
  SELECT id INTO v_contrib_a FROM rls_ids WHERE key = 'contrib_a';
  SELECT id INTO v_rec_income_a FROM rls_ids WHERE key = 'rec_income_a';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'C01', 'Carlos', 'A', 'left', 'SELECT household',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.households WHERE id = %L', v_nido_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'C02', 'Carlos', 'A', 'left', 'SELECT historical expense',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'C03', 'Carlos', 'A', 'left', 'SELECT historical income',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.incomes WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'C04', 'Carlos', 'A', 'left', 'SELECT historical budget',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'C05', 'Carlos', 'A', 'left', 'SELECT historical goal',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'C06', 'Carlos', 'A', 'left', 'SELECT historical contribution',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goal_contributions WHERE id = %L', v_contrib_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'C07', 'Carlos', 'A', 'left', 'INSERT expense',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 10, DATE '2026-08-02', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X22', 'Carlos', 'A', 'left', 'historical cannot insert with remaining payer',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 10, DATE '2026-08-02', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_diana, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X07', 'Carlos', 'A', 'left', 'create_expense after leave',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_expense(
          %L::uuid, %L::uuid, 10, 'Ya no miembro', DATE '2026-08-21', %L::uuid, 'personal',
          jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 10, 'percentage', 100))
        )
      $sql$,
      v_nido_a, v_cat_expense_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'X13', 'Carlos', 'A', 'left', 'historical member cannot modify',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_expense(
            %L::uuid, %L::uuid, 12, 'Ya salio', DATE '2026-08-21', %L::uuid, 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 12, 'percentage', 100))
          )
        $sql$,
        v_expense_a, v_cat_expense_a, v_carlos, v_carlos
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_expense(%L::uuid)',
        v_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.expenses SET description = %L WHERE id = %L',
        'historical overwrite', v_expense_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'C08', 'Carlos', 'A', 'left', 'INSERT income',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.incomes (
          household_id, member_id, category_id, amount, occurred_at, created_by
        ) VALUES (
          %L, %L, %L, 10, DATE '2026-08-02', %L
        )
      $sql$,
      v_nido_a, v_carlos, v_cat_income_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'C09', 'Carlos', 'A', 'left', 'UPDATE expense',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.expenses SET description = %L WHERE id = %L',
      'after leave', v_expense_a
    ))
  );

  PERFORM pg_temp.record_result(
    'C10', 'Carlos', 'A', 'left', 'UPDATE income',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.incomes SET description = %L WHERE id = %L',
      'after leave', v_income_a
    ))
  );

  PERFORM pg_temp.record_result(
    'I07', 'Carlos', 'A', 'left', 'historical member can read income',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.incomes WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'I08', 'Carlos', 'A', 'left', 'historical member cannot mutate income',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_income(
            %L::uuid, %L::uuid, 12, 'Ya salio', DATE '2026-08-21'
          )
        $sql$,
        v_income_a, v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_income(%L::uuid)',
        v_income_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'I09', 'Carlos', 'A', 'left', 'member who left cannot create income',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_income(
          %L::uuid, %L::uuid, 10, 'Despues de salir', DATE '2026-08-21'
        )
      $sql$,
      v_nido_a, v_cat_income_a
    ))
  );

  PERFORM pg_temp.record_result(
    'K07', 'Carlos', 'A', 'left', 'historical member can read budget',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'K08', 'Carlos', 'A', 'left', 'historical member cannot mutate budget',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_budget(
            %L::uuid, %L::uuid, 12, DATE '2026-01-01', DATE '2026-01-31'
          )
        $sql$,
        v_budget_a, v_cat_expense_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'SELECT public.soft_delete_budget(%L::uuid)',
        v_budget_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'K09', 'Carlos', 'A', 'left', 'member who left cannot create budget',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_budget(
          %L::uuid, %L::uuid, 10, DATE '2026-09-01', DATE '2026-09-30'
        )
      $sql$,
      v_nido_a, v_cat_expense_a
    ))
  );

  PERFORM pg_temp.record_result(
    'C11', 'Carlos', 'A', 'left', 'UPDATE budget',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.budgets SET amount = 1 WHERE id = %L', v_budget_a
    ))
  );

  PERFORM pg_temp.record_result(
    'C12', 'Carlos', 'A', 'left', 'UPDATE goal',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.goals SET name = %L WHERE id = %L',
      'after leave', v_goal_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Y10', 'Carlos', 'A', 'left', 'create_goal after leave',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal(
          %L::uuid, 'Ya no miembro', 100, 'saving', NULL, NULL
        )
      $sql$,
      v_nido_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Y11', 'Carlos', 'A', 'left', 'update_goal after leave',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.update_goal(
          %L::uuid, 'Ya salio', 1, 'saving', NULL, NULL
        )
      $sql$,
      v_goal_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Y12', 'Carlos', 'A', 'left', 'archive_goal after leave',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.archive_goal(%L::uuid)',
      v_goal_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Z10', 'Carlos', 'A', 'left', 'create_goal_contribution after leave',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(
          %L::uuid, 10, DATE '2026-08-21'
        )
      $sql$,
      v_goal_a
    ))
  );

  PERFORM pg_temp.record_result(
    'Z21', 'Carlos', 'A', 'left', 'historical member cannot update contribution',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_goal_contribution(
            %L::uuid, 12, DATE '2026-08-21'
          )
        $sql$,
        v_contrib_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goal_contributions SET amount = 12 WHERE id = %L',
        v_contrib_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'Z22', 'Carlos', 'A', 'left', 'member who left cannot delete contribution',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        'SELECT public.soft_delete_goal_contribution(%L::uuid)',
        v_contrib_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        'UPDATE public.goal_contributions SET deleted_at = now() WHERE id = %L',
        v_contrib_a
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'C13', 'Carlos', 'A', 'left', 'UPDATE recurring income',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.recurring_incomes SET is_active = false WHERE id = %L',
      v_rec_income_a
    ))
  );

  PERFORM pg_temp.record_result(
    'RE05', 'Carlos', 'A', 'historical', 'historical member can SELECT templates',
    'allow',
    CASE
      WHEN pg_temp.expect_count(format(
        'SELECT count(*) FROM public.recurring_incomes WHERE id = %L',
        v_rec_income_a
      )) = 1
      AND pg_temp.expect_count(
        'SELECT count(*) FROM public.recurring_incomes WHERE description = ''Sueldo plantilla'''
      ) = 1
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.record_result(
    'RE07', 'Carlos', 'A', 'left', 'member who left cannot edit or pause',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.update_recurring_income(
            (SELECT id FROM rls_ids WHERE key = 'rec_income_mutate_a'),
            %L::uuid, 12, 'Salio', 'monthly', NULL
          )
        $sql$,
        v_cat_income_a
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.set_recurring_expense_active(
            (SELECT id FROM rls_ids WHERE key = 'rec_expense_mutate_a'),
            false
          )
        $sql$
      )) = 'deny'
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'RE16', 'Carlos', 'A', 'left', 'departed creator cannot materialize',
    'deny',
    CASE
      WHEN pg_temp.expect_allow(format(
        $sql$
          SELECT public.materialize_recurring_income(
            (SELECT id FROM rls_ids WHERE key = 'rec_income_mutate_a'),
            DATE '2026-09-01'
          )
        $sql$
      )) = 'deny'
      AND pg_temp.expect_allow(format(
        $sql$
          SELECT public.materialize_recurring_expense(
            (SELECT id FROM rls_ids WHERE key = 'rec_expense_mutate_a'),
            DATE '2026-09-01'
          )
        $sql$
      )) = 'deny'
      AND EXISTS (
        SELECT 1 FROM public.incomes
        WHERE recurring_id = (SELECT id FROM rls_ids WHERE key = 'rec_income_mutate_a')
          AND deleted_at IS NULL
      )
      THEN 'deny'
      ELSE 'allow'
    END
  );

  PERFORM pg_temp.record_result(
    'C14', 'Carlos', 'A', 'left', 'UPDATE membership',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        UPDATE public.household_members
        SET role = 'owner'
        WHERE household_id = %L AND user_id = %L
      $sql$,
      v_nido_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'C15', 'Carlos', 'A', 'left', 'INSERT membership',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.household_members (household_id, user_id, role)
        VALUES (%L, %L, 'owner')
      $sql$,
      v_nido_a, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'C16', 'Carlos', 'A', 'left', 'UPDATE category',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.categories SET archived_at = now() WHERE household_id = %L',
      v_nido_a
    ))
  );

  PERFORM pg_temp.record_result(
    'C17', 'Carlos', 'A', 'left', 'SELECT Diana profile after leave',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.profiles WHERE id = %L', v_diana
    )) = 1 THEN 'allow' ELSE 'deny' END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Scenario D — Carlos joins Nido B after leaving A
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_nido_b uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';

  PERFORM pg_temp.clear_auth();

  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
  VALUES (v_nido_b, v_carlos, 'member', timestamptz '2026-08-02 00:00:00+00');
END;
$$;

DO $$
DECLARE
  v_carlos uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_income_a uuid;
  v_cat_income_b uuid;
  v_cat_expense_b uuid;
  v_expense_a uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';
  SELECT id INTO v_cat_income_b FROM rls_ids WHERE key = 'cat_income_b';
  SELECT id INTO v_cat_expense_b FROM rls_ids WHERE key = 'cat_expense_b';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';

  PERFORM pg_temp.set_auth(v_carlos);

  PERFORM pg_temp.record_result(
    'D01', 'Carlos', 'B', 'active', 'SELECT household B',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.households WHERE id = %L', v_nido_b
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'D02', 'Carlos', 'B', 'active', 'INSERT expense in B',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, %L, 15, DATE '2026-08-03', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_b, v_cat_expense_b, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'D03', 'Carlos', 'B', 'active', 'INSERT income in B',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.incomes (
          household_id, member_id, category_id, amount, occurred_at, created_by
        ) VALUES (
          %L, %L, %L, 20, DATE '2026-08-03', %L
        )
      $sql$,
      v_nido_b, v_carlos, v_cat_income_b, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'D04', 'Carlos', 'A', 'left', 'SELECT historical A after joining B',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE household_id = %L', v_nido_a
    )) >= 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'D05', 'Carlos', 'A', 'left', 'INSERT expense in A after joining B',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expenses (
          household_id, category_id, amount, occurred_at, payer_id,
          scope, distribution_method, created_by
        ) VALUES (
          %L, (
            SELECT id FROM public.categories
            WHERE household_id = %L AND type = 'expense' LIMIT 1
          ), 10, DATE '2026-08-03', %L, 'personal', 'fixed', %L
        )
      $sql$,
      v_nido_a, v_nido_a, v_carlos, v_carlos
    ))
  );

  PERFORM pg_temp.record_result(
    'D06', 'Carlos', 'A', 'left', 'UPDATE historical A expense after joining B',
    'deny',
    pg_temp.expect_allow(format(
      'UPDATE public.expenses SET description = %L WHERE id = %L',
      'move to b', v_expense_a
    ))
  );

  PERFORM pg_temp.record_result(
    'D07', 'Carlos', 'B', 'active', 'SELECT Luis profile after joining B',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.profiles WHERE id = %L', v_luis
    )) = 1 THEN 'allow' ELSE 'deny' END
  );
END;
$$;

-- Phase 9.2.2 — onboarding financial persist (OB01–OB11)
-- Uses dedicated users so existing Carlos/Diana/Luis assertions stay intact.

DO $$
DECLARE
  v_carlos uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_sofia uuid := gen_random_uuid();
  v_pablo uuid := gen_random_uuid();
  v_nora uuid := gen_random_uuid();
  v_nido_hist uuid := gen_random_uuid();
  v_sofia_nido uuid;
  v_sofia_nido_retry uuid;
  v_pablo_count integer;
  v_sofia_income integer;
  v_carlos_b_before integer;
  v_carlos_b_after integer;
  v_carlos_a_before integer;
  v_carlos_a_after integer;
  v_hist_before integer;
  v_hist_after integer;
  v_nora_nido uuid;
  v_luis_nido uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.create_auth_user(v_sofia, 'sofia-rls@example.test', 'Sofia');
  PERFORM pg_temp.create_auth_user(v_pablo, 'pablo-rls@example.test', 'Pablo');
  PERFORM pg_temp.create_auth_user(v_nora, 'nora-rls@example.test', 'Nora');

  INSERT INTO public.households (id, name, created_by)
  VALUES (v_nido_hist, 'Nido histórico Nora', v_nora);
  INSERT INTO public.household_members (
    household_id, user_id, role, joined_at, left_at
  ) VALUES (
    v_nido_hist, v_nora, 'owner',
    timestamptz '2026-01-01 00:00:00+00',
    timestamptz '2026-06-01 00:00:00+00'
  );

  SELECT count(*) INTO v_hist_before
  FROM public.incomes
  WHERE household_id = v_nido_hist AND deleted_at IS NULL;

  SELECT count(*) INTO v_carlos_b_before
  FROM public.incomes
  WHERE household_id = v_nido_b AND deleted_at IS NULL;
  SELECT count(*) INTO v_carlos_a_before
  FROM public.incomes
  WHERE household_id = v_nido_a AND deleted_at IS NULL;

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'OB01', 'none', '-', 'none', 'unauthenticated cannot finalize onboarding',
    'deny',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido huérfano', 1000)
      $sql$
    )
  );

  PERFORM pg_temp.set_auth(v_pablo);
  PERFORM pg_temp.record_result(
    'OB10', 'Pablo', 'new', 'none', 'invalid amount does not create a Nido',
    'deny',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido inválido', -10)
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT count(*) INTO v_pablo_count
  FROM public.household_members
  WHERE user_id = v_pablo AND left_at IS NULL;
  PERFORM pg_temp.record_result(
    'OB10b', 'Pablo', 'new', 'none', 'partially invalid data left no membership',
    'allow',
    CASE WHEN v_pablo_count = 0 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_sofia);
  PERFORM pg_temp.record_result(
    'OB02', 'Sofia', 'new', 'none', 'authenticated user without membership can persist',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido Sofia', 25000)
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT h.id INTO v_sofia_nido
  FROM public.households AS h
  INNER JOIN public.household_members AS hm ON hm.household_id = h.id
  WHERE hm.user_id = v_sofia AND hm.left_at IS NULL;
  SELECT count(*) INTO v_sofia_income
  FROM public.incomes
  WHERE household_id = v_sofia_nido
    AND created_by = v_sofia
    AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'OB02b', 'Sofia', 'new', 'owner', 'one Sueldo income on finalize',
    'allow',
    CASE WHEN v_sofia_income = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_sofia);
  PERFORM pg_temp.record_result(
    'OB03', 'Sofia', 'own', 'owner', 'double execution does not create a second Nido',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido Sofia otra vez', 25000)
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT h.id INTO v_sofia_nido_retry
  FROM public.households AS h
  INNER JOIN public.household_members AS hm ON hm.household_id = h.id
  WHERE hm.user_id = v_sofia AND hm.left_at IS NULL;
  SELECT count(*) INTO v_sofia_income
  FROM public.incomes
  WHERE household_id = v_sofia_nido
    AND created_by = v_sofia
    AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'OB03b', 'Sofia', 'own', 'owner', 'double execution does not duplicate income',
    'allow',
    CASE
      WHEN v_sofia_nido_retry = v_sofia_nido AND v_sofia_income = 1
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'OB05', 'Carlos', 'B', 'active elsewhere', 'already-active member does not create another Nido',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido hackeado', 99999)
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT count(*) INTO v_carlos_b_after
  FROM public.incomes
  WHERE household_id = v_nido_b AND deleted_at IS NULL;
  SELECT count(*) INTO v_carlos_a_after
  FROM public.incomes
  WHERE household_id = v_nido_a AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'OB06', 'Carlos', 'A', 'historical', 'cannot write onboarding income into a previous Nido',
    'allow',
    CASE
      WHEN v_carlos_a_after = v_carlos_a_before
       AND v_carlos_b_after = v_carlos_b_before
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_luis);
  SELECT id INTO v_luis_nido
  FROM public.create_household_with_onboarding_income('Nido Luis falso', 100);

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.record_result(
    'OB08', 'Luis', 'B', 'active other Nido', 'cannot target another household',
    'allow',
    CASE
      WHEN v_luis_nido = v_nido_b
       AND NOT EXISTS (
         SELECT 1 FROM public.households WHERE name = 'Nido Luis falso'
       )
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_nora);
  PERFORM pg_temp.record_result(
    'OB07', 'Nora', 'hist', 'historical only', 'historical member can create a new Nido',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido Nora nuevo', 18000)
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT h.id INTO v_nora_nido
  FROM public.households AS h
  INNER JOIN public.household_members AS hm ON hm.household_id = h.id
  WHERE hm.user_id = v_nora AND hm.left_at IS NULL;
  SELECT count(*) INTO v_hist_after
  FROM public.incomes
  WHERE household_id = v_nido_hist AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'OB07b', 'Nora', 'hist', 'left', 'new income is not written to the old Nido',
    'allow',
    CASE
      WHEN v_nora_nido IS NOT NULL
       AND v_nora_nido IS DISTINCT FROM v_nido_hist
       AND v_hist_after = v_hist_before
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_pablo);
  PERFORM pg_temp.record_result(
    'OB11', 'Pablo', 'new', 'none', 'zero income creates the Nido without a movement',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income('Nido Pablo', 0)
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.record_result(
    'OB11b', 'Pablo', 'own', 'owner', 'zero amount left no incomes row',
    'allow',
    CASE WHEN (
      SELECT count(*) FROM public.incomes
      WHERE created_by = v_pablo AND deleted_at IS NULL
    ) = 0 THEN 'allow' ELSE 'deny'
    END
  );
END;
$$;

-- Household create + first-owner bootstrap

DO $$
DECLARE
  v_carlos uuid;
  v_new_nido uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';

  PERFORM pg_temp.set_auth(v_carlos);

  -- Carlos is already an active member of B, so a second active
  -- membership must fail even if the household INSERT succeeds.
  PERFORM pg_temp.record_result(
    'M01', 'Carlos', 'new', 'active elsewhere', 'bootstrap second active owner',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.households (id, name, created_by)
        VALUES (%L, 'Nido C', %L);
        INSERT INTO public.household_members (household_id, user_id, role)
        VALUES (%L, %L, 'owner');
      $sql$,
      v_new_nido, v_carlos, v_new_nido, v_carlos
    ))
  );
END;
$$;

-- Recursion smoke test: helpers used by policies must not throw

DO $$
DECLARE
  v_carlos uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_ok boolean := false;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';

  PERFORM pg_temp.set_auth(v_carlos);

  BEGIN
    PERFORM public.is_household_member(v_nido_a);
    PERFORM public.is_active_household_member(v_nido_a);
    PERFORM public.is_household_owner(v_nido_a);
    PERFORM public.is_household_member(v_nido_b);
    PERFORM public.is_active_household_member(v_nido_b);
    PERFORM (
      SELECT count(*) FROM public.household_members WHERE household_id = v_nido_a
    );
    PERFORM (
      SELECT count(*) FROM public.household_members WHERE household_id = v_nido_b
    );
    v_ok := true;
  EXCEPTION
    WHEN OTHERS THEN
      v_ok := false;
  END;

  PERFORM pg_temp.record_result(
    'R01', 'Carlos', 'A+B', 'mixed', 'membership helper recursion smoke',
    'allow',
    CASE WHEN v_ok THEN 'allow' ELSE 'deny' END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.4.1 — household name, categories, default_split_method, create_expense (HS01–HS24)
-- Prefix HS: Y01–Y12 are already goal cases.
-- Temporary rows only. ROLLBACK at the end. Does not touch Departamento / Smoke 924.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_expense_a uuid;
  v_cat_income_a uuid;
  v_created_by uuid;
  v_name text;
  v_method public.household_split_method;
  v_updated_by uuid;
  v_new_cat uuid;
  v_archived_at timestamptz;
  v_delete_ok boolean := false;
  v_reactivated uuid;
  v_musica_count integer;
  v_today date := (timezone('America/Mexico_City', now()))::date;
  v_expense_id uuid;
  v_dist public.distribution_method;
  v_carlos_amt numeric;
  v_diana_amt numeric;
  v_carlos_income numeric;
  v_diana_income numeric;
  v_month_start date;
  v_month_end date;
  v_pers_dist public.distribution_method;
  v_eq_dist public.distribution_method;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_cat_income_a FROM rls_ids WHERE key = 'cat_income_a';

  -- T26 left Carlos historical on A; D then made him active on B.
  -- HS/V/BC/RF need him active on A again. Close B first (one-active-Nido).
  PERFORM pg_temp.clear_auth();
  UPDATE public.household_members
    SET left_at = timestamptz '2026-08-22 00:00:00+00'
    WHERE household_id = v_nido_b AND user_id = v_carlos AND left_at IS NULL;
  UPDATE public.household_members
    SET left_at = NULL
    WHERE household_id = v_nido_a AND user_id = v_carlos;

  PERFORM pg_temp.set_auth(v_carlos);

  SELECT default_split_method INTO v_method
  FROM public.households WHERE id = v_nido_a;

  PERFORM pg_temp.record_result(
    'HS01', 'Carlos', 'A', 'active', 'default_split_method is equal',
    'allow',
    CASE WHEN v_method = 'equal' THEN 'allow' ELSE 'deny' END
  );

  SELECT created_by INTO v_created_by FROM public.households WHERE id = v_nido_a;

  PERFORM pg_temp.record_result(
    'HS02', 'Carlos', 'A', 'active', 'update_household_name trims and writes name only',
    'allow',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.update_household_name(%L) $sql$,
      '  Nido A 941  '
    ))
  );

  SELECT name, created_by INTO v_name, v_updated_by
  FROM public.households WHERE id = v_nido_a;

  PERFORM pg_temp.record_result(
    'HS03', 'Carlos', 'A', 'active', 'household name changed and created_by intact',
    'allow',
    CASE
      WHEN v_name = 'Nido A 941' AND v_updated_by = v_created_by THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.record_result(
    'HS04', 'Carlos', 'A', 'active', 'empty household name rejected',
    'deny',
    pg_temp.expect_allow($sql$ SELECT public.update_household_name('   ') $sql$)
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'HS05', 'Diana', 'A', 'active', 'active member can update household name',
    'allow',
    pg_temp.expect_allow($sql$ SELECT public.update_household_name('Nido A') $sql$)
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM public.update_household_name('Nido B touched');
  PERFORM pg_temp.clear_auth();
  SELECT name INTO v_name FROM public.households WHERE id = v_nido_a;
  PERFORM pg_temp.record_result(
    'HS06', 'Luis', 'A', 'never member', 'name RPC cannot change another Nido',
    'allow',
    CASE WHEN v_name = 'Nido A' THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.set_auth(v_luis);
  PERFORM public.update_household_name('Nido B');

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'HS07', 'Carlos', 'A', 'active', 'persist proportional split preference',
    'allow',
    pg_temp.expect_allow(
      $sql$ SELECT public.update_household_default_split_method('proportional') $sql$
    )
  );

  PERFORM pg_temp.record_result(
    'HS08', 'Carlos', 'A', 'active', 'capacity is not a valid household split method',
    'deny',
    pg_temp.expect_allow(
      $sql$ SELECT public.update_household_default_split_method('capacity'::text::public.household_split_method) $sql$
    )
  );

  PERFORM pg_temp.record_result(
    'HS09', 'Carlos', 'A', 'active', 'create custom category',
    'allow',
    pg_temp.expect_allow(
      $sql$ SELECT public.create_category('Spotify', 'expense', NULL) $sql$
    )
  );

  SELECT id INTO v_new_cat
  FROM public.categories
  WHERE household_id = v_nido_a AND name = 'Spotify' AND archived_at IS NULL;

  PERFORM pg_temp.record_result(
    'HS10', 'Carlos', 'A', 'active', 'duplicate active category name rejected',
    'deny',
    pg_temp.expect_allow(
      $sql$ SELECT public.create_category('spotify', 'expense', NULL) $sql$
    )
  );

  PERFORM pg_temp.record_result(
    'HS11', 'Carlos', 'A', 'active', 'rename category',
    'allow',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.rename_category(%L::uuid, 'Musica') $sql$,
      v_new_cat
    ))
  );

  PERFORM pg_temp.record_result(
    'HS12', 'Carlos', 'A', 'active', 'rename conflict with active name',
    'deny',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.rename_category(%L::uuid, 'Groceries') $sql$,
      v_new_cat
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'HS13', 'Luis', 'A', 'never member', 'cannot rename other Nido category',
    'deny',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.rename_category(%L::uuid, 'Hack') $sql$,
      v_new_cat
    ))
  );
  PERFORM pg_temp.record_result(
    'HS14', 'Luis', 'A', 'never member', 'cannot archive other Nido category',
    'deny',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.archive_category(%L::uuid) $sql$,
      v_new_cat
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'HS15', 'Carlos', 'A', 'active', 'archive category',
    'allow',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.archive_category(%L::uuid) $sql$,
      v_new_cat
    ))
  );

  SELECT archived_at INTO v_archived_at
  FROM public.categories WHERE id = v_new_cat;

  PERFORM pg_temp.record_result(
    'HS16', 'Carlos', 'A', 'active', 'archived category still readable',
    'allow',
    CASE
      WHEN v_archived_at IS NOT NULL
        AND pg_temp.expect_count(format(
          'SELECT count(*) FROM public.categories WHERE id = %L', v_new_cat
        )) = 1
      THEN 'allow'
      ELSE 'deny'
    END
  );

  BEGIN
    DELETE FROM public.categories WHERE id = v_new_cat;
    v_delete_ok := true;
  EXCEPTION
    WHEN OTHERS THEN
      v_delete_ok := false;
  END;

  PERFORM pg_temp.record_result(
    'HS17', 'Carlos', 'A', 'active', 'hard delete category denied',
    'allow',
    CASE
      WHEN v_delete_ok = false
        AND pg_temp.expect_count(format(
          'SELECT count(*) FROM public.categories WHERE id = %L', v_new_cat
        )) = 1
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  BEGIN
    SELECT public.create_category('  MUSICA  ', 'expense', NULL) INTO v_reactivated;
  EXCEPTION
    WHEN OTHERS THEN
      v_reactivated := NULL;
  END;
  SELECT archived_at INTO v_archived_at FROM public.categories WHERE id = v_new_cat;
  SELECT count(*) INTO v_musica_count
  FROM public.categories
  WHERE household_id = v_nido_a AND lower(trim(name)) = lower('Musica') AND type = 'expense';

  PERFORM pg_temp.record_result(
    'HS21', 'Carlos', 'A', 'active', 'create archived name reactivates same row',
    'allow',
    CASE
      WHEN v_reactivated = v_new_cat
        AND v_archived_at IS NULL
        AND v_musica_count = 1
      THEN 'allow'
      ELSE 'deny'
    END
  );

  PERFORM pg_temp.record_result(
    'HS22', 'Carlos', 'A', 'active', 'reactivated name cannot be created again',
    'deny',
    pg_temp.expect_allow(
      $sql$ SELECT public.create_category('musica', 'expense', NULL) $sql$
    )
  );

  PERFORM pg_temp.record_result(
    'HS23', 'Carlos', 'A', 'active', 'custom income category rejected',
    'deny',
    pg_temp.expect_allow(
      $sql$ SELECT public.create_category('Musica', 'income', NULL) $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  INSERT INTO public.categories (household_id, name, type, created_by)
  VALUES (v_nido_a, 'Extra', 'income', v_carlos)
  RETURNING id INTO v_new_cat;
  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'HS24', 'Carlos', 'A', 'active', 'extra cannot be a recurring income',
    'deny',
    pg_temp.expect_allow(format(
      $sql$ SELECT public.create_recurring_income(
        %L::uuid, %L::uuid, 500, 'Bono', DATE '2026-08-01', 'monthly', NULL
      ) $sql$,
      v_nido_a, v_new_cat
    ))
  );

  PERFORM pg_temp.clear_auth();
  INSERT INTO public.incomes (
    household_id, member_id, category_id, amount, occurred_at, created_by, description
  ) VALUES
    (v_nido_a, v_carlos, v_cat_income_a, 30000, v_today, v_carlos, 'RLS 941 Carlos'),
    (v_nido_a, v_diana, v_cat_income_a, 10000, v_today, v_diana, 'RLS 941 Diana');

  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
  SELECT coalesce(sum(amount), 0) INTO v_carlos_income
  FROM public.incomes
  WHERE household_id = v_nido_a AND member_id = v_carlos
    AND deleted_at IS NULL
    AND occurred_at >= v_month_start AND occurred_at <= v_month_end;
  SELECT coalesce(sum(amount), 0) INTO v_diana_income
  FROM public.incomes
  WHERE household_id = v_nido_a AND member_id = v_diana
    AND deleted_at IS NULL
    AND occurred_at >= v_month_start AND occurred_at <= v_month_end;

  PERFORM pg_temp.set_auth(v_carlos);

  SELECT public.create_expense(
    v_nido_a,
    v_cat_expense_a,
    100,
    'Cena proporcional',
    v_today,
    v_carlos,
    'shared',
    jsonb_build_array(
      jsonb_build_object('member_id', v_carlos, 'amount', 50, 'percentage', 50),
      jsonb_build_object('member_id', v_diana, 'amount', 50, 'percentage', 50)
    )
  ) INTO v_expense_id;

  SELECT distribution_method INTO v_dist
  FROM public.expenses WHERE id = v_expense_id;
  SELECT amount INTO v_carlos_amt
  FROM public.expense_splits WHERE expense_id = v_expense_id AND member_id = v_carlos;
  SELECT amount INTO v_diana_amt
  FROM public.expense_splits WHERE expense_id = v_expense_id AND member_id = v_diana;

  PERFORM pg_temp.record_result(
    'HS18', 'Carlos', 'A', 'active', 'shared proportional uses current-month incomes',
    'allow',
    CASE
      WHEN v_dist = 'income_based'
        AND v_carlos_income > 0 AND v_diana_income > 0
        AND v_carlos_amt + v_diana_amt = 100
        AND abs(
          v_carlos_amt
          - round(100 * v_carlos_income / (v_carlos_income + v_diana_income), 2)
        ) <= 0.01
      THEN 'allow'
      ELSE 'deny'
    END
  );

  SELECT public.create_expense(
    v_nido_a,
    v_cat_expense_a,
    40,
    'Cafe personal',
    v_today,
    v_carlos,
    'personal',
    jsonb_build_array(
      jsonb_build_object('member_id', v_carlos, 'amount', 40, 'percentage', 100)
    )
  ) INTO v_expense_id;

  SELECT distribution_method INTO v_pers_dist
  FROM public.expenses WHERE id = v_expense_id;

  PERFORM pg_temp.record_result(
    'HS19', 'Carlos', 'A', 'active', 'personal ignores household split preference',
    'allow',
    CASE WHEN v_pers_dist = 'fixed' THEN 'allow' ELSE 'deny' END
  );

  PERFORM public.update_household_default_split_method('equal');

  SELECT public.create_expense(
    v_nido_a,
    v_cat_expense_a,
    80,
    'Cena igualitaria',
    v_today,
    v_carlos,
    'shared',
    jsonb_build_array(
      jsonb_build_object('member_id', v_carlos, 'amount', 40, 'percentage', 50),
      jsonb_build_object('member_id', v_diana, 'amount', 40, 'percentage', 50)
    )
  ) INTO v_expense_id;

  SELECT distribution_method INTO v_eq_dist
  FROM public.expenses WHERE id = v_expense_id;

  PERFORM pg_temp.record_result(
    'HS20', 'Carlos', 'A', 'active', 'shared equal keeps equal distribution',
    'allow',
    CASE WHEN v_eq_dist = 'equal' THEN 'allow' ELSE 'deny' END
  );
END;
$$;

-- Phase 9.4.2 — onboarding savings stock, estimates → budgets, split method
DO $$
DECLARE
  v_quinn uuid := '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01';
  v_rita uuid := '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a02';
  v_carlos uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_quinn_nido uuid;
  v_rita_nido uuid;
  v_today date := (timezone('America/Mexico_City', now()))::date;
  v_month_start date := date_trunc('month', (timezone('America/Mexico_City', now()))::date)::date;
  v_month_end date;
  v_savings_personal integer;
  v_savings_shared integer;
  v_income_count integer;
  v_expense_count integer;
  v_goal_count integer;
  v_budget_shared integer;
  v_budget_personal integer;
  v_budget_amount numeric;
  v_budget_member uuid;
  v_renta_count integer;
  v_vivienda_count integer;
  v_restaurantes_count integer;
  v_masajes_count integer;
  v_active_expense_count integer;
  v_split public.household_split_method;
  v_retry_id uuid;
  v_foreign_savings integer;
BEGIN
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.create_auth_user(v_quinn, 'quinn-rls@example.test', 'Quinn');
  PERFORM pg_temp.create_auth_user(v_rita, 'rita-rls@example.test', 'Rita');

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'OB12', 'none', '-', 'none', 'unauthenticated cannot persist onboarding stock',
    'deny',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income(
          'Nido huérfano 942',
          1000,
          'equal',
          100,
          200,
          '[{"name":"Renta","icon":"🏢","type":"shared","amount":8000}]'::jsonb
        )
      $sql$
    )
  );

  PERFORM pg_temp.set_auth(v_quinn);
  PERFORM pg_temp.record_result(
    'OB13', 'Quinn', 'new', 'none', 'capacity split is rejected',
    'deny',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income(
          'Nido capacity',
          1000,
          'capacity'
        )
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.record_result(
    'OB13b', 'Quinn', 'new', 'none', 'rejected capacity left no Nido',
    'allow',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.household_members WHERE user_id = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01' AND left_at IS NULL
    ) THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_quinn);
  PERFORM pg_temp.record_result(
    'OB14', 'Quinn', 'new', 'none', 'equal persist with savings and estimates',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income(
          'Nido Quinn',
          25000,
          'equal',
          1500,
          2000,
          '[
            {"name":"Renta","icon":"🏢","type":"shared","amount":8000},
            {"name":"Gym","icon":"🏋️","type":"personal","amount":800},
            {"name":"Restaurantes","icon":"🍔","type":"shared","amount":1500},
            {"name":"Spotify","icon":"🎵","type":"personal","amount":200},
            {"name":"Masajes","icon":"💅","type":"personal","amount":0}
          ]'::jsonb
        )
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT h.id, h.default_split_method
  INTO v_quinn_nido, v_split
  FROM public.households AS h
  INNER JOIN public.household_members AS hm ON hm.household_id = h.id
  WHERE hm.user_id = v_quinn AND hm.left_at IS NULL;

  SELECT count(*) INTO v_savings_personal
  FROM public.savings_balances
  WHERE household_id = v_quinn_nido AND member_id = v_quinn AND amount = 1500;

  SELECT count(*) INTO v_savings_shared
  FROM public.savings_balances
  WHERE household_id = v_quinn_nido AND member_id IS NULL AND amount = 2000;

  SELECT count(*) INTO v_income_count
  FROM public.incomes
  WHERE household_id = v_quinn_nido AND deleted_at IS NULL;

  SELECT count(*) INTO v_expense_count
  FROM public.expenses
  WHERE household_id = v_quinn_nido AND deleted_at IS NULL;

  SELECT count(*) INTO v_goal_count
  FROM public.goals
  WHERE household_id = v_quinn_nido;

  SELECT count(*) INTO v_budget_shared
  FROM public.budgets
  WHERE household_id = v_quinn_nido
    AND member_id IS NULL
    AND deleted_at IS NULL
    AND start_date = v_month_start
    AND end_date = v_month_end;

  SELECT count(*) INTO v_budget_personal
  FROM public.budgets
  WHERE household_id = v_quinn_nido
    AND member_id = v_quinn
    AND deleted_at IS NULL
    AND start_date = v_month_start
    AND end_date = v_month_end;

  SELECT count(*) INTO v_renta_count
  FROM public.categories
  WHERE household_id = v_quinn_nido
    AND type = 'expense'
    AND archived_at IS NULL
    AND lower(name) = 'renta';

  SELECT count(*) INTO v_vivienda_count
  FROM public.categories
  WHERE household_id = v_quinn_nido
    AND type = 'expense'
    AND archived_at IS NULL
    AND lower(name) = 'vivienda';

  SELECT count(*) INTO v_restaurantes_count
  FROM public.categories
  WHERE household_id = v_quinn_nido
    AND type = 'expense'
    AND archived_at IS NULL
    AND lower(name) = 'restaurantes';

  SELECT count(*) INTO v_masajes_count
  FROM public.categories
  WHERE household_id = v_quinn_nido
    AND type = 'expense'
    AND archived_at IS NULL
    AND lower(name) = 'masajes';

  SELECT count(*) INTO v_active_expense_count
  FROM public.categories
  WHERE household_id = v_quinn_nido
    AND type = 'expense'
    AND archived_at IS NULL;

  PERFORM pg_temp.record_result(
    'OB15', 'Quinn', 'own', 'owner', 'equal split persisted',
    'allow',
    CASE WHEN v_split = 'equal' THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'OB16', 'Quinn', 'own', 'owner', 'personal and shared savings stock persisted',
    'allow',
    CASE WHEN v_savings_personal = 1 AND v_savings_shared = 1 THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'OB17', 'Quinn', 'own', 'owner', 'savings did not become income, expense, or goal',
    'allow',
    CASE
      WHEN v_income_count = 1 AND v_expense_count = 0 AND v_goal_count = 0
      THEN 'allow' ELSE 'deny'
    END
  );
  PERFORM pg_temp.record_result(
    'OB18', 'Quinn', 'own', 'owner', 'shared estimates became Nido budgets for this month',
    'allow',
    CASE WHEN v_budget_shared = 2 THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'OB19', 'Quinn', 'own', 'owner', 'personal estimates became personal budgets',
    'allow',
    CASE WHEN v_budget_personal = 2 THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'OB20', 'Quinn', 'own', 'owner', 'Renta is a custom category; unused Vivienda is not listed',
    'allow',
    CASE WHEN v_renta_count = 1 AND v_vivienda_count = 0 THEN 'allow' ELSE 'deny' END
  );
  PERFORM pg_temp.record_result(
    'OB21', 'Quinn', 'own', 'owner', 'only filled and custom expense categories stay active',
    'allow',
    CASE
      WHEN v_restaurantes_count = 1
       AND v_masajes_count = 1
       AND v_active_expense_count = 5
      THEN 'allow' ELSE 'deny'
    END
  );

  SELECT b.amount, b.member_id
  INTO v_budget_amount, v_budget_member
  FROM public.budgets AS b
  INNER JOIN public.categories AS c ON c.id = b.category_id
  WHERE b.household_id = v_quinn_nido
    AND b.deleted_at IS NULL
    AND lower(c.name) = 'renta';

  PERFORM pg_temp.record_result(
    'OB22', 'Quinn', 'own', 'owner', 'Renta budget amount and household scope',
    'allow',
    CASE
      WHEN v_budget_amount = 8000 AND v_budget_member IS NULL
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_quinn);
  SELECT id INTO v_retry_id
  FROM public.create_household_with_onboarding_income(
    'Nido Quinn otra vez',
    99999,
    'proportional',
    50,
    60,
    '[{"name":"Renta","icon":"🏢","type":"shared","amount":1}]'::jsonb
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.record_result(
    'OB23', 'Quinn', 'own', 'owner', 'retry does not duplicate household, savings, budgets, or categories',
    'allow',
    CASE
      WHEN v_retry_id = v_quinn_nido
       AND (
         SELECT count(*) FROM public.savings_balances WHERE household_id = v_quinn_nido
       ) = 2
       AND (
         SELECT count(*) FROM public.budgets
         WHERE household_id = v_quinn_nido AND deleted_at IS NULL
       ) = 4
       AND v_renta_count = 1
       AND (
         SELECT default_split_method FROM public.households WHERE id = v_quinn_nido
       ) = 'equal'
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_rita);
  PERFORM pg_temp.record_result(
    'OB24', 'Rita', 'new', 'none', 'proportional persist with zero savings',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income(
          'Nido Rita',
          0,
          'proportional',
          0,
          0,
          '[{"name":"Supermercado","icon":"🛒","type":"shared","amount":3000}]'::jsonb
        )
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT h.id, h.default_split_method
  INTO v_rita_nido, v_split
  FROM public.households AS h
  INNER JOIN public.household_members AS hm ON hm.household_id = h.id
  WHERE hm.user_id = v_rita AND hm.left_at IS NULL;

  PERFORM pg_temp.record_result(
    'OB25', 'Rita', 'own', 'owner', 'proportional split and zero stock persisted without income',
    'allow',
    CASE
      WHEN v_split = 'proportional'
       AND (
         SELECT count(*) FROM public.incomes
         WHERE household_id = v_rita_nido AND deleted_at IS NULL
       ) = 0
       AND (
         SELECT count(*) FROM public.savings_balances
         WHERE household_id = v_rita_nido AND amount = 0
       ) = 2
       AND (
         SELECT count(*) FROM public.categories
         WHERE household_id = v_rita_nido
           AND type = 'expense'
           AND archived_at IS NULL
           AND lower(name) = 'supermercado'
       ) = 1
       AND (
         SELECT count(*) FROM public.categories
         WHERE household_id = v_rita_nido
           AND type = 'expense'
           AND archived_at IS NULL
       ) = 1
       AND (
         SELECT count(*) FROM public.expenses
         WHERE household_id = v_rita_nido AND deleted_at IS NULL
       ) = 0
      THEN 'allow' ELSE 'deny'
    END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'OB26', 'Carlos', 'B', 'active elsewhere', 'cannot write savings into another Nido by payload',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.create_household_with_onboarding_income(
          'Nido ajeno',
          10,
          'equal',
          999,
          999,
          '[]'::jsonb
        )
      $sql$
    )
  );

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  SELECT count(*) INTO v_foreign_savings
  FROM public.savings_balances
  WHERE household_id IN (v_nido_a, v_nido_b);

  PERFORM pg_temp.record_result(
    'OB27', 'Carlos', 'A/B', 'active', 'existing Nidos received no onboarding savings',
    'allow',
    CASE WHEN v_foreign_savings = 0 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_rita);
  PERFORM pg_temp.record_result(
    'OB28', 'Rita', 'Quinn', 'other Nido', 'cannot insert personal savings for another member',
    'deny',
    pg_temp.expect_allow(
      format(
        $sql$
          INSERT INTO public.savings_balances (
            household_id, member_id, amount, recorded_at, created_by
          ) VALUES (
            %L, %L, 50, %L, %L
          )
        $sql$,
        v_quinn_nido,
        v_quinn,
        v_today,
        v_rita
      )
    )
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.4.3 — personal visibility (V01–V22)
-- Goal/fund scope cases V23–V30 reuse this block.
-- Default is nido, so earlier SELECT cases stay valid until this block
-- flips Carlos to private and back.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_nido_a uuid;
  v_nido_b uuid;
  v_cat_expense_a uuid;
  v_expense_a uuid;
  v_split_a uuid;
  v_budget_a uuid;
  v_shared_expense uuid := 'f1111111-1111-4111-8111-111111111111';
  v_personal_budget uuid := 'f2222222-2222-4222-8222-222222222222';
  v_personal_savings uuid := 'f3333333-3333-4333-8333-333333333333';
  v_shared_savings uuid := 'f4444444-4444-4444-8444-444444444444';
  v_personal_goal uuid := 'f5555555-5555-4555-8555-555555555555';
  v_personal_goal_contrib uuid := 'f6666666-6666-4666-8666-666666666666';
  v_created_personal uuid;
  v_created_nido uuid;
  v_goal_a uuid;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_nido_a FROM rls_ids WHERE key = 'nido_a';
  SELECT id INTO v_nido_b FROM rls_ids WHERE key = 'nido_b';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';
  SELECT id INTO v_split_a FROM rls_ids WHERE key = 'split_a';
  SELECT id INTO v_budget_a FROM rls_ids WHERE key = 'budget_a';
  SELECT id INTO v_goal_a FROM rls_ids WHERE key = 'goal_a';

  PERFORM pg_temp.clear_auth();
  RESET ROLE;

  INSERT INTO public.expenses (
    id, household_id, category_id, amount, occurred_at, payer_id,
    scope, distribution_method, created_by
  ) VALUES (
    v_shared_expense, v_nido_a, v_cat_expense_a, 120, DATE '2026-01-21', v_carlos,
    'shared', 'equal', v_carlos
  );

  INSERT INTO public.expense_splits (
    expense_id, member_id, amount, percentage
  ) VALUES
    (v_shared_expense, v_carlos, 60, 50),
    (v_shared_expense, v_diana, 60, 50);

  INSERT INTO public.budgets (
    id, household_id, member_id, category_id, amount, period,
    start_date, end_date, created_by
  ) VALUES (
    v_personal_budget, v_nido_a, v_carlos, v_cat_expense_a, 200, 'monthly',
    DATE '2026-01-01', DATE '2026-01-31', v_carlos
  );

  INSERT INTO public.savings_balances (
    id, household_id, member_id, amount, recorded_at, created_by
  ) VALUES
    (v_personal_savings, v_nido_a, v_carlos, 1500, DATE '2026-01-21', v_carlos),
    (v_shared_savings, v_nido_a, NULL, 2000, DATE '2026-01-21', v_carlos);

  INSERT INTO public.goals (
    id, household_id, name, goal_type, target_amount, status, created_by, scope
  ) VALUES (
    v_personal_goal, v_nido_a, 'Fondo personal', 'saving', 3000, 'active', v_carlos, 'personal'
  );

  INSERT INTO public.goal_contributions (
    id, goal_id, member_id, amount, contributed_at, created_by
  ) VALUES (
    v_personal_goal_contrib, v_personal_goal, v_carlos, 400, DATE '2026-01-21', v_carlos
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V01', 'Carlos', 'A', 'active', 'owner can update own personal_visibility',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.update_personal_visibility('private')
      $sql$
    )
  );

  PERFORM pg_temp.record_result(
    'V02', 'Carlos', 'A', 'active', 'cannot update another member personal_visibility',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        UPDATE public.profiles
        SET personal_visibility = 'private'
        WHERE id = %L
      $sql$,
      v_diana
    ))
  );

  PERFORM pg_temp.record_result(
    'V03', 'Carlos', 'A', 'active', 'owner reads own private personal expense',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'V04', 'Diana', 'A', 'active', 'peer cannot read private personal expense',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'V05', 'Diana', 'A', 'active', 'peer cannot read splits of a private personal expense',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_splits WHERE expense_id = %L', v_expense_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'V06', 'Diana', 'A', 'active', 'peer still reads shared expense when owner is private',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_shared_expense
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'V07', 'Luis', 'A', 'other Nido', 'other Nido cannot read personal expense',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V08', 'Carlos', 'A', 'active', 'owner reads own private personal budget',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_personal_budget
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'V09', 'Diana', 'A', 'active', 'peer cannot read private personal budget',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_personal_budget
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'V10', 'Diana', 'A', 'active', 'peer still reads Nido budget when owner is private',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_budget_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V11', 'Carlos', 'A', 'active', 'owner reads own private personal savings',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.savings_balances WHERE id = %L', v_personal_savings
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'V12', 'Diana', 'A', 'active', 'peer cannot read private personal savings',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.savings_balances WHERE id = %L', v_personal_savings
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'V13', 'Diana', 'A', 'active', 'peer still reads shared savings when owner is private',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.savings_balances WHERE id = %L', v_shared_savings
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V14', 'Carlos', 'A', 'active', 'owner can restore visibility to nido',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.update_personal_visibility('nido')
      $sql$
    )
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'V15', 'Diana', 'A', 'active', 'peer reads personal expense when nido',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'V16', 'Diana', 'A', 'active', 'peer reads personal budget when nido',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_personal_budget
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'V17', 'Diana', 'A', 'active', 'peer reads personal savings when nido',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.savings_balances WHERE id = %L', v_personal_savings
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V23', 'Carlos', 'A', 'active', 'owner reads own personal goal after restoring nido',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE id = %L', v_personal_goal
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'V24', 'Diana', 'A', 'active', 'peer reads personal goal when nido',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE id = %L', v_personal_goal
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'V25', 'Diana', 'A', 'active', 'peer still reads shared goal',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE id = %L', v_goal_a
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'V26', 'Diana', 'A', 'active', 'peer cannot contribute to others personal goal',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(%L::uuid, 50, DATE '2026-01-22')
      $sql$,
      v_personal_goal
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V27', 'Carlos', 'A', 'active', 'owner can contribute to own personal goal',
    'allow',
    pg_temp.expect_allow(format(
      $sql$
        SELECT public.create_goal_contribution(%L::uuid, 50, DATE '2026-01-22')
      $sql$,
      v_personal_goal
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V28', 'Carlos', 'A', 'active', 'owner can hide personal goal again',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.update_personal_visibility('private')
      $sql$
    )
  );

  PERFORM pg_temp.record_result(
    'V32', 'Carlos', 'A', 'active', 'owner reads own private personal goal',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE id = %L', v_personal_goal
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'V29', 'Diana', 'A', 'active', 'peer cannot read private personal goal',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goals WHERE id = %L', v_personal_goal
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'V30', 'Diana', 'A', 'active', 'peer cannot read contributions of a private personal goal',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.goal_contributions WHERE id = %L', v_personal_goal_contrib
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V31', 'Carlos', 'A', 'active', 'owner restores visibility after goal cases',
    'allow',
    pg_temp.expect_allow(
      $sql$
        SELECT public.update_personal_visibility('nido')
      $sql$
    )
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'V18', 'Luis', 'A', 'other Nido', 'other Nido still cannot read personal nido rows',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expenses WHERE id = %L', v_expense_a
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_budget(
    v_nido_a,
    v_cat_expense_a,
    250,
    DATE '2026-08-01',
    DATE '2026-08-31',
    true
  ) INTO v_created_personal;

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.record_result(
    'V19', 'Carlos', 'A', 'active', 'create_budget personal writes member_id = caller',
    'allow',
    CASE WHEN EXISTS (
      SELECT 1 FROM public.budgets
      WHERE id = v_created_personal
        AND member_id = v_carlos
        AND created_by = v_carlos
        AND deleted_at IS NULL
    ) THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_budget(
    v_nido_a,
    v_cat_expense_a,
    400,
    DATE '2026-09-01',
    DATE '2026-09-30'
  ) INTO v_created_nido;

  PERFORM pg_temp.clear_auth();
  RESET ROLE;
  PERFORM pg_temp.record_result(
    'V20', 'Carlos', 'A', 'active', 'create_budget default remains Nido-level',
    'allow',
    CASE WHEN EXISTS (
      SELECT 1 FROM public.budgets
      WHERE id = v_created_nido
        AND member_id IS NULL
        AND created_by = v_carlos
        AND deleted_at IS NULL
    ) THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.record_result(
    'V21', 'Carlos', 'A', 'active', 'cannot insert a personal budget for another member',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.budgets (
          household_id, member_id, category_id, amount, period,
          start_date, end_date, created_by
        ) VALUES (
          %L, %L, %L, 90, 'monthly',
          DATE '2026-10-01', DATE '2026-10-31', %L
        )
      $sql$,
      v_nido_a,
      v_diana,
      v_cat_expense_a,
      v_carlos
    ))
  );

  PERFORM pg_temp.clear_auth();
  PERFORM pg_temp.record_result(
    'V22', 'none', '-', 'none', 'unauthenticated cannot update visibility',
    'deny',
    pg_temp.expect_allow(
      $sql$
        SELECT public.update_personal_visibility('private')
      $sql$
    )
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.4.4 — budget consumption visibility (BC01–BC06)
-- Prefix BC: C01–C06 are already historical-member cases.
-- No new RPC. Aggregates must only see rows RLS already allows.
-- Nido consumption includes visible personal expenses (D5).
-- A private personal expense must not enter a peer's SUM.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_cat_expense_a uuid;
  v_expense_a uuid;
  v_shared_expense uuid := 'f1111111-1111-4111-8111-111111111111';
  v_personal_budget uuid := 'f2222222-2222-4222-8222-222222222222';
  v_peer_sum numeric;
  v_owner_sum numeric;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_cat_expense_a FROM rls_ids WHERE key = 'cat_expense_a';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.expect_allow(
    $sql$
      SELECT public.update_personal_visibility('private')
    $sql$
  );

  PERFORM pg_temp.set_auth(v_diana);
  SELECT coalesce(sum(amount), 0)
  INTO v_peer_sum
  FROM public.expenses
  WHERE id IN (v_expense_a, v_shared_expense)
    AND category_id = v_cat_expense_a
    AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'BC01', 'Diana', 'A', 'active', 'private personal expense omitted from peer Nido consumption SUM',
    'deny',
    CASE WHEN v_peer_sum = 120 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'BC02', 'Diana', 'A', 'active', 'peer cannot read private personal budget consumption',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_personal_budget
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT coalesce(sum(amount), 0)
  INTO v_owner_sum
  FROM public.expenses
  WHERE id IN (v_expense_a, v_shared_expense)
    AND category_id = v_cat_expense_a
    AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'BC03', 'Carlos', 'A', 'active', 'owner SUM includes own private personal expense',
    'allow',
    CASE WHEN v_owner_sum = 200 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'BC04', 'Carlos', 'A', 'active', 'owner still reads own personal budget',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_personal_budget
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.expect_allow(
    $sql$
      SELECT public.update_personal_visibility('nido')
    $sql$
  );

  PERFORM pg_temp.set_auth(v_diana);
  SELECT coalesce(sum(amount), 0)
  INTO v_peer_sum
  FROM public.expenses
  WHERE id IN (v_expense_a, v_shared_expense)
    AND category_id = v_cat_expense_a
    AND deleted_at IS NULL;

  PERFORM pg_temp.record_result(
    'BC05', 'Diana', 'A', 'active', 'visible personal expense enters peer Nido consumption SUM',
    'allow',
    CASE WHEN v_peer_sum = 200 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'BC06', 'Diana', 'A', 'active', 'peer can read personal budget when nido',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.budgets WHERE id = %L', v_personal_budget
    )) = 1 THEN 'allow' ELSE 'deny' END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Phase 9.4.5 — expense refunds (RF01–RF12)
-- R01 is already the membership-helper recursion smoke. These cases use RF.
-- Refunds inherit expense visibility. Only the expense creator can insert.
-- Refunds are immutable (no UPDATE/DELETE policies).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_carlos uuid;
  v_diana uuid;
  v_luis uuid;
  v_expense_a uuid;
  v_shared_expense uuid := 'f1111111-1111-4111-8111-111111111111';
  v_refund_personal uuid;
  v_today date := (timezone('America/Mexico_City', now()))::date;
BEGIN
  SELECT id INTO v_carlos FROM rls_ids WHERE key = 'carlos';
  SELECT id INTO v_diana FROM rls_ids WHERE key = 'diana';
  SELECT id INTO v_luis FROM rls_ids WHERE key = 'luis';
  SELECT id INTO v_expense_a FROM rls_ids WHERE key = 'expense_a';

  PERFORM pg_temp.set_auth(v_carlos);
  SELECT public.create_expense_refund(v_expense_a, 20) INTO v_refund_personal;

  PERFORM pg_temp.record_result(
    'RF01', 'Carlos', 'A', 'active', 'owner can create refund',
    'allow',
    CASE WHEN v_refund_personal IS NOT NULL THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'RF02', 'Carlos', 'A', 'active', 'owner can read refund',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refunds WHERE id = %L', v_refund_personal
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'RF03', 'Carlos', 'A', 'active', 'owner can read refund splits',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refund_splits WHERE refund_id = %L',
      v_refund_personal
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.expect_allow(
    $sql$
      SELECT public.update_personal_visibility('private')
    $sql$
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'RF04', 'Diana', 'A', 'active', 'peer cannot read private refund',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refunds WHERE id = %L', v_refund_personal
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.expect_allow(
    $sql$
      SELECT public.update_personal_visibility('nido')
    $sql$
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'RF05', 'Diana', 'A', 'active', 'peer can read visible refund',
    'allow',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refunds WHERE id = %L', v_refund_personal
    )) = 1 THEN 'allow' ELSE 'deny' END
  );

  PERFORM pg_temp.record_result(
    'RF06', 'Diana', 'A', 'active', 'peer cannot create refund without expense permission',
    'deny',
    pg_temp.expect_allow(format(
      'SELECT public.create_expense_refund(%L::uuid, 10)', v_shared_expense
    ))
  );

  PERFORM pg_temp.set_auth(v_luis);
  PERFORM pg_temp.record_result(
    'RF07', 'Luis', 'A', 'other Nido', 'other household cannot read',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refunds WHERE id = %L', v_refund_personal
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'RF08', 'Luis', 'A', 'other Nido', 'other household cannot insert',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expense_refunds (
          expense_id, amount, occurred_at, created_by
        ) VALUES (
          %L, 10, %L, %L
        )
      $sql$,
      v_expense_a,
      v_today,
      v_luis
    ))
  );

  PERFORM pg_temp.clear_auth();
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.record_result(
    'RF09', 'none', '-', 'none', 'anonymous cannot read',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refunds WHERE id = %L', v_refund_personal
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'RF10', 'none', '-', 'none', 'anonymous cannot insert',
    'deny',
    pg_temp.expect_allow(format(
      $sql$
        INSERT INTO public.expense_refunds (
          expense_id, amount, occurred_at, created_by
        ) VALUES (
          %L, 10, %L, %L
        )
      $sql$,
      v_expense_a,
      v_today,
      v_carlos
    ))
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.expect_allow(
    $sql$
      SELECT public.update_personal_visibility('private')
    $sql$
  );

  PERFORM pg_temp.set_auth(v_diana);
  PERFORM pg_temp.record_result(
    'RF11', 'Diana', 'A', 'active', 'refund cannot bypass expense visibility',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refunds WHERE id = %L', v_refund_personal
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.record_result(
    'RF12', 'Diana', 'A', 'active', 'refund splits inherit visibility',
    'deny',
    CASE WHEN pg_temp.expect_count(format(
      'SELECT count(*) FROM public.expense_refund_splits WHERE refund_id = %L',
      v_refund_personal
    )) = 0 THEN 'deny' ELSE 'allow' END
  );

  PERFORM pg_temp.set_auth(v_carlos);
  PERFORM pg_temp.expect_allow(
    $sql$
      SELECT public.update_personal_visibility('nido')
    $sql$
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Report
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_failed integer;
  v_total integer;
  v_row record;
  v_details text := '';
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*)
  INTO v_failed, v_total
  FROM rls_test_results;

  RAISE NOTICE 'RLS security matrix: % passed, % failed, % total',
    v_total - v_failed, v_failed, v_total;

  FOR v_row IN
    SELECT * FROM rls_test_results ORDER BY test_id
  LOOP
    RAISE NOTICE '% | % | % | % | % | expected=% actual=% | %',
      v_row.test_id,
      v_row.actor,
      v_row.household,
      v_row.membership,
      v_row.operation,
      v_row.expected,
      v_row.actual,
      CASE WHEN v_row.passed THEN 'PASS' ELSE 'FAIL' END;

    IF NOT v_row.passed THEN
      v_details := v_details || format(
        E'\n  %s %s/%s %s expected %s got %s',
        v_row.test_id,
        v_row.actor,
        v_row.household,
        v_row.operation,
        v_row.expected,
        v_row.actual
      );
    END IF;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'RLS security matrix failed (% tests)%', v_failed, v_details;
  END IF;
END;
$$;

SELECT test_id, actor, household, membership, operation, expected, actual, passed
FROM rls_test_results
ORDER BY test_id;

ROLLBACK;
