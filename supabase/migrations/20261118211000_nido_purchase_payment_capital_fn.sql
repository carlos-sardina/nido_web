-- Abono a capital: lógica de registro y deshacer (enum/columnas en migración previa).

CREATE OR REPLACE FUNCTION public.register_purchase_payments(
  p_household_id uuid,
  p_member_id uuid,
  p_paid_at date,
  p_notes text,
  p_items jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_notes text;
  v_item jsonb;
  v_purchase_id uuid;
  v_kind text;
  v_count int;
  v_payment_id uuid;
  v_amount numeric(12, 2);
  v_left numeric(12, 2);
  v_apply numeric(12, 2);
  v_deleted timestamptz;
  v_household uuid;
  v_method public.purchase_payment_method;
  v_inst record;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_inst_ids uuid[] := ARRAY[]::uuid[];
  v_covered int;
  v_balance numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF p_household_id IS NULL OR NOT public.is_active_household_member(p_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_remove_target' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.assert_active_household_member(p_household_id, p_member_id);
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  v_notes := trim(both FROM coalesce(p_notes, ''));
  IF v_notes = '' THEN
    v_notes := NULL;
  ELSIF char_length(v_notes) > 200 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_purchase_id := (v_item->>'purchase_id')::uuid;
    v_kind := lower(trim(both FROM coalesce(v_item->>'kind', '')));
    v_count := coalesce(nullif(v_item->>'count', '')::int, 1);
    v_amount := NULL;

    IF v_purchase_id IS NULL THEN
      RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_kind NOT IN ('installment', 'payoff', 'capital') THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;
    IF v_kind = 'installment' AND (v_count IS NULL OR v_count < 1 OR v_count > 48) THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;

    SELECT household_id, deleted_at, payment_method
      INTO v_household, v_deleted, v_method
      FROM public.purchases
     WHERE id = v_purchase_id;

    IF v_household IS NULL THEN
      RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'nido.purchase_deleted' USING ERRCODE = 'P0001';
    END IF;
    IF v_household <> p_household_id THEN
      RAISE EXCEPTION 'nido.forbidden' USING ERRCODE = 'P0001';
    END IF;

    v_covered := 0;
    v_inst_ids := ARRAY[]::uuid[];

    IF v_kind = 'payoff' THEN
      SELECT coalesce(array_agg(id ORDER BY installment_number), ARRAY[]::uuid[]),
             coalesce(sum(amount), 0)
        INTO v_inst_ids, v_amount
        FROM public.purchase_installments
       WHERE purchase_id = v_purchase_id AND paid_at IS NULL;

      IF v_amount IS NULL OR v_amount <= 0 THEN
        SELECT round(gross_amount, 2) INTO v_amount
          FROM public.purchases WHERE id = v_purchase_id;
        SELECT coalesce(sum(amount), 0) INTO v_covered
          FROM public.purchase_payments
         WHERE purchase_id = v_purchase_id AND deleted_at IS NULL;
        v_amount := round(v_amount - v_covered, 2);
        IF v_amount <= 0 THEN
          RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
        END IF;
        v_inst_ids := ARRAY[]::uuid[];
      ELSE
        UPDATE public.purchase_installments
           SET paid_at = p_paid_at
         WHERE id = ANY (v_inst_ids);
      END IF;

      INSERT INTO public.purchase_payments (
        purchase_id, member_id, amount, paid_at, kind, notes, created_by
      ) VALUES (
        v_purchase_id, p_member_id, v_amount, p_paid_at, 'payoff', v_notes, v_user_id
      )
      RETURNING id INTO v_payment_id;

      IF coalesce(array_length(v_inst_ids, 1), 0) > 0 THEN
        INSERT INTO public.purchase_payment_installments (
          payment_id, installment_id, applied_amount, reduced_remaining
        )
        SELECT v_payment_id, pi.id, pi.amount, false
          FROM public.purchase_installments pi
         WHERE pi.id = ANY (v_inst_ids);
      END IF;

    ELSIF v_kind = 'capital' THEN
      -- Abono a capital: monto libre que reduce desde las últimas cuotas.
      BEGIN
        v_amount := round((v_item->>'amount')::numeric, 2);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
      END;

      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
      END IF;

      SELECT coalesce(sum(amount), 0) INTO v_balance
        FROM public.purchase_installments
       WHERE purchase_id = v_purchase_id AND paid_at IS NULL;

      IF v_balance <= 0 THEN
        SELECT round(gross_amount, 2) INTO v_balance
          FROM public.purchases WHERE id = v_purchase_id;
        SELECT coalesce(sum(amount), 0) INTO v_covered
          FROM public.purchase_payments
         WHERE purchase_id = v_purchase_id AND deleted_at IS NULL;
        v_balance := round(v_balance - v_covered, 2);
      END IF;

      IF v_amount > v_balance THEN
        RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.purchase_payments (
        purchase_id, member_id, amount, paid_at, kind, notes, created_by
      ) VALUES (
        v_purchase_id, p_member_id, v_amount, p_paid_at, 'capital', v_notes, v_user_id
      )
      RETURNING id INTO v_payment_id;

      v_left := v_amount;

      FOR v_inst IN
        SELECT id, amount
          FROM public.purchase_installments
         WHERE purchase_id = v_purchase_id AND paid_at IS NULL
         ORDER BY installment_number DESC
      LOOP
        EXIT WHEN v_left <= 0;
        IF v_left >= v_inst.amount THEN
          v_apply := v_inst.amount;
          UPDATE public.purchase_installments
             SET paid_at = p_paid_at
           WHERE id = v_inst.id;
          INSERT INTO public.purchase_payment_installments (
            payment_id, installment_id, applied_amount, reduced_remaining
          ) VALUES (
            v_payment_id, v_inst.id, v_apply, false
          );
          v_left := round(v_left - v_apply, 2);
        ELSE
          v_apply := v_left;
          UPDATE public.purchase_installments
             SET amount = round(amount - v_apply, 2)
           WHERE id = v_inst.id;
          INSERT INTO public.purchase_payment_installments (
            payment_id, installment_id, applied_amount, reduced_remaining
          ) VALUES (
            v_payment_id, v_inst.id, v_apply, true
          );
          v_left := 0;
        END IF;
      END LOOP;

      -- Compra de contado sin cuotas: solo queda el ledger del pago.
      IF v_left > 0 AND v_balance > 0 AND v_left = v_amount THEN
        -- No había cuotas a las que aplicar; el pago queda registrado igual.
        NULL;
      ELSIF v_left > 0 THEN
        RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
      END IF;

    ELSE
      -- Paga las siguientes N cuotas pendientes.
      v_amount := 0;
      FOR v_inst IN
        SELECT id, amount
          FROM public.purchase_installments
         WHERE purchase_id = v_purchase_id AND paid_at IS NULL
         ORDER BY installment_number ASC
         LIMIT v_count
      LOOP
        v_amount := round(v_amount + v_inst.amount, 2);
        v_covered := v_covered + 1;
        v_inst_ids := array_append(v_inst_ids, v_inst.id);
        UPDATE public.purchase_installments
           SET paid_at = p_paid_at
         WHERE id = v_inst.id;
      END LOOP;

      IF v_covered = 0 OR v_amount <= 0 THEN
        RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.purchase_payments (
        purchase_id, member_id, amount, paid_at, kind, notes, created_by
      ) VALUES (
        v_purchase_id, p_member_id, v_amount, p_paid_at, 'installment', v_notes, v_user_id
      )
      RETURNING id INTO v_payment_id;

      INSERT INTO public.purchase_payment_installments (
        payment_id, installment_id, applied_amount, reduced_remaining
      )
      SELECT v_payment_id, pi.id, pi.amount, false
        FROM public.purchase_installments pi
       WHERE pi.id = ANY (v_inst_ids);
    END IF;

    v_ids := array_append(v_ids, v_payment_id);
  END LOOP;

  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_payment(
  p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household uuid;
  v_deleted timestamptz;
  v_link record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.household_id, pp.deleted_at
    INTO v_household, v_deleted
    FROM public.purchase_payments pp
    JOIN public.purchases p ON p.id = pp.purchase_id
   WHERE pp.id = p_payment_id;

  IF v_household IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RETURN p_payment_id;
  END IF;
  IF NOT public.is_active_household_member(v_household) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  FOR v_link IN
    SELECT installment_id, applied_amount, reduced_remaining
      FROM public.purchase_payment_installments
     WHERE payment_id = p_payment_id
  LOOP
    IF v_link.reduced_remaining THEN
      UPDATE public.purchase_installments
         SET amount = round(amount + v_link.applied_amount, 2)
       WHERE id = v_link.installment_id;
    ELSE
      UPDATE public.purchase_installments pi
         SET paid_at = NULL
       WHERE pi.id = v_link.installment_id
         AND NOT EXISTS (
               SELECT 1
                 FROM public.purchase_payment_installments ppi
                 JOIN public.purchase_payments pp ON pp.id = ppi.payment_id
                WHERE ppi.installment_id = pi.id
                  AND ppi.payment_id <> p_payment_id
                  AND pp.deleted_at IS NULL
                  AND ppi.reduced_remaining = false
             );
    END IF;
  END LOOP;

  DELETE FROM public.purchase_payment_installments WHERE payment_id = p_payment_id;

  UPDATE public.purchase_payments
     SET deleted_at = now()
   WHERE id = p_payment_id;

  RETURN p_payment_id;
END;
$$;
