-- QA estricto: auditoría de compras a plazos (purchase_audit_events).
-- Usa el Nido QA existente (Ana/Luis). No toca otros módulos.

CREATE TABLE IF NOT EXISTS public._qa_audit_run (
  seq integer PRIMARY KEY,
  kind text NOT NULL,
  check_id text NOT NULL,
  ok boolean NOT NULL,
  detail text
);
ALTER TABLE public._qa_audit_run DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._qa_audit_run TO authenticated;
TRUNCATE public._qa_audit_run;

CREATE OR REPLACE FUNCTION pg_temp.qa_note(p_kind text, p_id text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public._qa_audit_run (seq, kind, check_id, ok, detail)
  VALUES (
    (SELECT coalesce(max(seq), 0) + 1 FROM public._qa_audit_run),
    p_kind, p_id, p_ok, left(coalesce(p_detail, ''), 500)
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  SET LOCAL ROLE authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.clear_auth()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

DO $$
DECLARE
  v_ana uuid := 'a11a0000-0000-4000-8000-0000000000a1';
  v_luis uuid := 'a11a0000-0000-4000-8000-0000000000b2';
  v_ajena uuid := 'a11a0000-0000-4000-8000-0000000000c3';
  v_household uuid;
  v_bbva uuid;
  v_purchase uuid;
  v_card uuid;
  v_bonus uuid;
  v_inst uuid;
  v_payment_ids uuid[];
  v_payment uuid;
  v_count integer;
  v_amount numeric;
  v_detail text;
  v_meta jsonb;
  v_action text;
  v_entity text;
  v_actor uuid;
  v_marker text := 'QA Audit ' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  -- Triggers stamp occurred_at with now() (tx time). Do not compare against clock_timestamp().
  v_before timestamptz := now() - interval '1 second';
BEGIN
  PERFORM pg_temp.set_auth(v_ana);

  SELECT hm.household_id INTO v_household
  FROM public.household_members hm
  WHERE hm.user_id = v_ana AND hm.left_at IS NULL
  ORDER BY hm.joined_at
  LIMIT 1;

  PERFORM pg_temp.qa_note('setup', 'household', v_household IS NOT NULL, coalesce(v_household::text, 'null'));
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'QA household missing';
  END IF;

  SELECT id INTO v_bbva
  FROM public.payment_cards
  WHERE household_id = v_household AND deleted_at IS NULL AND label = 'BBVA Ana'
  LIMIT 1;
  PERFORM pg_temp.qa_note('setup', 'bbva', v_bbva IS NOT NULL, coalesce(v_bbva::text, 'null'));

  -- Schema / grants
  PERFORM pg_temp.qa_note(
    'schema', 'table',
    to_regclass('public.purchase_audit_events') IS NOT NULL,
    coalesce(to_regclass('public.purchase_audit_events')::text, 'missing')
  );
  PERFORM pg_temp.qa_note(
    'schema', 'no-client-insert',
    NOT has_table_privilege('authenticated', 'public.purchase_audit_events', 'insert'),
    'authenticated insert privilege'
  );
  PERFORM pg_temp.qa_note(
    'schema', 'select-ok',
    has_table_privilege('authenticated', 'public.purchase_audit_events', 'select'),
    'authenticated select privilege'
  );

  -- 1) Create purchase → audit created
  v_purchase := public.create_purchase(
    v_household,
    v_marker,
    'audit harness',
    'QA Store',
    current_date,
    900,
    'msi',
    3,
    v_bbva,
    NULL,
    jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)),
    '[]'::jsonb,
    '🧪'
  );

  SELECT count(*), max(amount), max(detail), (array_agg(actor_id))[1]
    INTO v_count, v_amount, v_detail, v_actor
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase
    AND entity_type = 'purchase'
    AND action = 'created'
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note(
    'assert', 'purchase-created',
    v_count = 1 AND v_amount = 900 AND v_actor = v_ana AND v_detail ILIKE '%MSI%',
    format('count=%s amount=%s actor=%s detail=%s', v_count, v_amount, v_actor, v_detail)
  );

  -- Shares + installments created with the purchase
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase
    AND entity_type = 'purchase_share'
    AND action = 'created'
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note('assert', 'share-created', v_count >= 1, v_count::text);

  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase
    AND entity_type = 'purchase_installment'
    AND action = 'created'
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note('assert', 'installments-created', v_count = 3, v_count::text);

  -- 2) Register installment payment → payment audit with payer/day/amount/kind
  v_payment_ids := public.register_purchase_payments(
    v_household,
    v_luis,
    current_date,
    'transferencia QA',
    jsonb_build_array(jsonb_build_object('purchase_id', v_purchase, 'kind', 'installment', 'count', 1))
  );
  v_payment := v_payment_ids[1];

  SELECT count(*), max(amount), max(detail), (array_agg(meta))[1], (array_agg(actor_id))[1]
    INTO v_count, v_amount, v_detail, v_meta, v_actor
  FROM public.purchase_audit_events
  WHERE entity_type = 'purchase_payment'
    AND action = 'created'
    AND entity_id = v_payment
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note(
    'assert', 'payment-created-fields',
    v_count = 1
      AND v_amount = 300
      AND v_actor = v_ana
      AND (v_meta->>'member_id') = v_luis::text
      AND (v_meta->>'paid_at') = current_date::text
      AND (v_meta->>'kind') = 'installment'
      AND (v_meta->>'notes') = 'transferencia QA'
      AND (v_meta->>'member_name') ILIKE '%Luis%'
      AND v_detail ILIKE '%depositó%',
    format('count=%s amount=%s meta=%s detail=%s', v_count, v_amount, v_meta, v_detail)
  );

  -- Installment marked paid as side-effect of ledger payment
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase
    AND entity_type = 'purchase_installment'
    AND action = 'marked_paid'
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note('assert', 'installment-marked-via-payment', v_count >= 1, v_count::text);

  -- 3) Undo payment → undone event persists (append-only)
  PERFORM public.soft_delete_purchase_payment(v_payment);

  SELECT count(*), max(amount), max(detail), (array_agg(meta))[1]
    INTO v_count, v_amount, v_detail, v_meta
  FROM public.purchase_audit_events
  WHERE entity_type = 'purchase_payment'
    AND action = 'undone'
    AND entity_id = v_payment
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note(
    'assert', 'payment-undone',
    v_count = 1
      AND v_amount = 300
      AND (v_meta->>'member_id') = v_luis::text
      AND (v_meta->>'paid_at') = current_date::text
      AND coalesce((v_meta->>'installment_link_count')::int, 0) >= 1
      AND v_detail ILIKE '%Deshacer%',
    format('count=%s amount=%s detail=%s meta=%s', v_count, v_amount, v_detail, v_meta)
  );

  -- Undo also marks installment unpaid in audit
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase
    AND entity_type = 'purchase_installment'
    AND action = 'marked_unpaid'
    AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note('assert', 'installment-unpaid-via-undo', v_count >= 1, v_count::text);

  -- Created payment event still exists after undo
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE entity_id = v_payment AND action = 'created';
  PERFORM pg_temp.qa_note('assert', 'payment-created-survives-undo', v_count = 1, v_count::text);

  -- Live payment list empty but audit has 2 payment events
  SELECT count(*) INTO v_count
  FROM public.purchase_payments
  WHERE id = v_payment AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('assert', 'live-payment-gone', v_count = 0, v_count::text);

  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE entity_id = v_payment AND entity_type = 'purchase_payment';
  PERFORM pg_temp.qa_note('assert', 'audit-payment-rows', v_count = 2, v_count::text);

  -- 4) Capital payment
  v_payment_ids := public.register_purchase_payments(
    v_household,
    v_ana,
    current_date,
    'abono QA',
    jsonb_build_array(jsonb_build_object('purchase_id', v_purchase, 'kind', 'capital', 'amount', 100))
  );
  SELECT count(*), max(meta->>'kind'), max(amount)
    INTO v_count, v_detail, v_amount
  FROM public.purchase_audit_events
  WHERE entity_id = v_payment_ids[1] AND action = 'created';
  PERFORM pg_temp.qa_note(
    'assert', 'capital-payment-audit',
    v_count = 1 AND v_detail = 'capital' AND v_amount = 100,
    format('count=%s kind=%s amount=%s', v_count, v_detail, v_amount)
  );

  -- Amount change on installment from capital should audit updated
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase
    AND entity_type = 'purchase_installment'
    AND action = 'updated'
    AND occurred_at >= v_before
    AND detail ILIKE '%monto%';
  PERFORM pg_temp.qa_note('assert', 'capital-reduces-installment-audit', v_count >= 1, v_count::text);

  -- 5) Manual mark installment unpaid then paid (orphan path after undo of first cuota may vary)
  SELECT id INTO v_inst
  FROM public.purchase_installments
  WHERE purchase_id = v_purchase AND paid_at IS NULL
  ORDER BY installment_number
  LIMIT 1;

  IF v_inst IS NOT NULL THEN
    PERFORM public.mark_purchase_installment_paid(v_inst, current_date);
    SELECT count(*), max(meta->>'installment_number')
      INTO v_count, v_detail
    FROM public.purchase_audit_events
    WHERE entity_id = v_inst AND action = 'marked_paid' AND occurred_at >= v_before;
    PERFORM pg_temp.qa_note('assert', 'manual-mark-paid', v_count >= 1, format('count=%s n=%s', v_count, v_detail));

    PERFORM public.mark_purchase_installment_paid(v_inst, NULL);
    SELECT count(*) INTO v_count
    FROM public.purchase_audit_events
    WHERE entity_id = v_inst AND action = 'marked_unpaid' AND occurred_at >= v_before;
    PERFORM pg_temp.qa_note('assert', 'manual-mark-unpaid', v_count >= 1, v_count::text);
  ELSE
    PERFORM pg_temp.qa_note('assert', 'manual-mark-paid', false, 'no open installment');
    PERFORM pg_temp.qa_note('assert', 'manual-mark-unpaid', false, 'no open installment');
  END IF;

  -- 6) Bonus create + received + unreceived
  v_bonus := public.create_purchase_bonus(v_purchase, 'cashback', 'Cashback QA', 50, current_date + 30, 'nota bono');
  SELECT count(*), max(amount), max(detail)
    INTO v_count, v_amount, v_detail
  FROM public.purchase_audit_events
  WHERE entity_id = v_bonus AND action = 'created';
  PERFORM pg_temp.qa_note(
    'assert', 'bonus-created',
    v_count = 1 AND v_amount = 50 AND v_detail ILIKE '%cashback%',
    format('count=%s amount=%s detail=%s', v_count, v_amount, v_detail)
  );

  PERFORM public.update_purchase_bonus(v_bonus, 'Cashback QA', 50, current_date + 30, current_date, 'nota bono');
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE entity_id = v_bonus AND action = 'received';
  PERFORM pg_temp.qa_note('assert', 'bonus-received', v_count = 1, v_count::text);

  PERFORM public.update_purchase_bonus(v_bonus, 'Cashback QA', 50, current_date + 30, NULL, 'nota bono');
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE entity_id = v_bonus AND action = 'unreceived';
  PERFORM pg_temp.qa_note('assert', 'bonus-unreceived', v_count = 1, v_count::text);

  -- 7) Card create + soft-delete
  v_card := public.create_payment_card(v_household, v_ana, v_marker || ' Card', 'QA Bank', '9999', 10, 25);
  SELECT count(*), max(detail)
    INTO v_count, v_detail
  FROM public.purchase_audit_events
  WHERE entity_id = v_card AND entity_type = 'payment_card' AND action = 'created';
  PERFORM pg_temp.qa_note(
    'assert', 'card-created',
    v_count = 1 AND v_detail ILIKE '%corte 10%',
    format('count=%s detail=%s', v_count, v_detail)
  );

  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE entity_id = v_card AND action = 'created' AND purchase_id IS NULL;
  PERFORM pg_temp.qa_note('assert', 'card-no-purchase-id', v_count = 1, v_count::text);

  PERFORM public.soft_delete_payment_card(v_card);
  SELECT count(*), max(detail) INTO v_count, v_detail
  FROM public.purchase_audit_events
  WHERE entity_id = v_card AND action = 'deleted';
  PERFORM pg_temp.qa_note(
    'assert', 'card-deleted',
    v_count = 1 AND v_detail ILIKE '%eliminada%',
    format('count=%s detail=%s', v_count, v_detail)
  );

  -- 8) Soft-delete purchase → deleted audit; bonus cascade should NOT spam if purchase deleted
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE purchase_id = v_purchase AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note('assert', 'events-before-delete', v_count >= 8, v_count::text);

  PERFORM public.soft_delete_purchase(v_purchase);

  SELECT count(*), max(detail) INTO v_count, v_detail
  FROM public.purchase_audit_events
  WHERE entity_id = v_purchase AND action = 'deleted';
  PERFORM pg_temp.qa_note(
    'assert', 'purchase-deleted',
    v_count = 1 AND v_detail ILIKE '%eliminada%',
    format('count=%s detail=%s', v_count, v_detail)
  );

  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE entity_id = v_bonus AND action = 'deleted' AND occurred_at >= v_before;
  PERFORM pg_temp.qa_note(
    'assert', 'bonus-cascade-suppressed',
    v_count = 0,
    'cascaded bonus deletes=' || v_count::text
  );

  -- 9) RLS: Luis can read household audit; ajena cannot
  PERFORM pg_temp.set_auth(v_luis);
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE household_id = v_household AND entity_id = v_purchase;
  PERFORM pg_temp.qa_note('rls', 'luis-lee-audit', v_count >= 1, v_count::text);

  PERFORM pg_temp.set_auth(v_ajena);
  SELECT count(*) INTO v_count
  FROM public.purchase_audit_events
  WHERE household_id = v_household;
  PERFORM pg_temp.qa_note('rls', 'ajena-no-lee', v_count = 0, v_count::text);

  PERFORM pg_temp.set_auth(v_ana);

  -- 10) Client cannot insert / update / delete
  BEGIN
    INSERT INTO public.purchase_audit_events (
      household_id, actor_id, action, entity_type, entity_id, label
    ) VALUES (
      v_household, v_ana, 'created', 'purchase', gen_random_uuid(), 'hack'
    );
    PERFORM pg_temp.qa_note('reject', 'client-insert-blocked', false, 'se permitió');
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    PERFORM pg_temp.qa_note(
      'reject', 'client-insert-blocked',
      SQLSTATE IN ('42501') OR SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%policy%',
      SQLERRM
    );
  END;

  BEGIN
    UPDATE public.purchase_audit_events SET label = 'hacked' WHERE entity_id = v_purchase;
    PERFORM pg_temp.qa_note('reject', 'client-update-blocked', false, 'se permitió');
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    PERFORM pg_temp.qa_note(
      'reject', 'client-update-blocked',
      SQLSTATE IN ('42501') OR SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%policy%',
      SQLERRM
    );
  END;

  BEGIN
    DELETE FROM public.purchase_audit_events WHERE entity_id = v_purchase;
    PERFORM pg_temp.qa_note('reject', 'client-delete-blocked', false, 'se permitió');
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    PERFORM pg_temp.qa_note(
      'reject', 'client-delete-blocked',
      SQLSTATE IN ('42501') OR SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%policy%',
      SQLERRM
    );
  END;

  INSERT INTO public._qa_audit_run (seq, kind, check_id, ok, detail)
  SELECT
    (SELECT coalesce(max(seq), 0) FROM public._qa_audit_run) + 1,
    'summary',
    'totals',
    (SELECT count(*) FILTER (WHERE NOT ok) = 0 FROM public._qa_audit_run WHERE kind <> 'setup'),
    format(
      'passed=%s failed=%s',
      (SELECT count(*) FILTER (WHERE ok) FROM public._qa_audit_run WHERE kind <> 'setup'),
      (SELECT count(*) FILTER (WHERE NOT ok) FROM public._qa_audit_run WHERE kind <> 'setup')
    );

  PERFORM pg_temp.clear_auth();
END;
$$;

SELECT kind, check_id, ok, detail
FROM public._qa_audit_run
ORDER BY seq;

SELECT
  count(*) FILTER (WHERE ok) AS passed,
  count(*) FILTER (WHERE NOT ok) AS failed,
  count(*) AS total
FROM public._qa_audit_run
WHERE kind NOT IN ('setup', 'summary');
