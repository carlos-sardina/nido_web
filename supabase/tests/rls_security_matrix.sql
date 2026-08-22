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
--      budget mutations, owner transfer)
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
          %L::uuid, %L::uuid, 40, 'Cena editada', DATE '2026-08-21', 'shared',
          jsonb_build_array(
            jsonb_build_object('member_id', %L, 'amount', 20, 'percentage', 50),
            jsonb_build_object('member_id', %L, 'amount', 20, 'percentage', 50)
          )
        )
      $sql$,
      v_mutate, v_cat_expense_a, v_carlos, v_diana
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
            %L::uuid, %L::uuid, 15, 'Diana no puede', DATE '2026-08-21', 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 15, 'percentage', 100))
          )
        $sql$,
        v_mutate, v_cat_expense_a, v_diana
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
            %L::uuid, %L::uuid, 15, 'Luis no puede', DATE '2026-08-21', 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 15, 'percentage', 100))
          )
        $sql$,
        v_mutate, v_cat_expense_a, v_luis
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
            %L::uuid, %L::uuid, 12, 'Ya eliminado', DATE '2026-08-21', 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 12, 'percentage', 100))
          )
        $sql$,
        v_mutate, v_cat_expense_a, v_carlos
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
            %L::uuid, %L::uuid, 12, 'Ya salio', DATE '2026-08-21', 'personal',
            jsonb_build_array(jsonb_build_object('member_id', %L, 'amount', 12, 'percentage', 100))
          )
        $sql$,
        v_expense_a, v_cat_expense_a, v_carlos
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
