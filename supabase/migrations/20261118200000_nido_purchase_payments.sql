-- Pagos de miembros hacia compras a plazos: cuotas, desparcializar / de contado.

DO $$ BEGIN
  CREATE TYPE public.purchase_payment_kind AS ENUM ('installment', 'payoff');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  paid_at date NOT NULL,
  kind public.purchase_payment_kind NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT purchase_payments_amount_positive CHECK (
    amount > 0 AND amount <= 9999999999.99
  ),
  CONSTRAINT purchase_payments_notes_len CHECK (
    notes IS NULL OR char_length(trim(notes)) BETWEEN 1 AND 200
  )
);

COMMENT ON TABLE public.purchase_payments IS
  'Dinero que un miembro del Nido depositó/pagó hacia una compra a plazos (cuota o desparcialización).';

CREATE INDEX purchase_payments_purchase_live_idx
  ON public.purchase_payments (purchase_id)
  WHERE deleted_at IS NULL;

CREATE TABLE public.purchase_payment_installments (
  payment_id uuid NOT NULL REFERENCES public.purchase_payments (id) ON DELETE CASCADE,
  installment_id uuid NOT NULL REFERENCES public.purchase_installments (id) ON DELETE CASCADE,
  PRIMARY KEY (payment_id, installment_id)
);

COMMENT ON TABLE public.purchase_payment_installments IS
  'Cuotas cubiertas por un pago de compra a plazos.';

CREATE OR REPLACE FUNCTION public.household_id_for_purchase_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.household_id
    FROM public.purchase_payments pp
    JOIN public.purchases p ON p.id = pp.purchase_id
   WHERE pp.id = p_payment_id;
$$;

ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payment_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_payments_select_members
  ON public.purchase_payments FOR SELECT TO authenticated
  USING (public.is_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_payments_insert_active
  ON public.purchase_payments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_purchase(purchase_id))
    AND created_by = auth.uid()
  );

CREATE POLICY purchase_payments_update_active
  ON public.purchase_payments FOR UPDATE TO authenticated
  USING (public.is_active_household_member(public.household_id_for_purchase(purchase_id)))
  WITH CHECK (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_payment_installments_select_members
  ON public.purchase_payment_installments FOR SELECT TO authenticated
  USING (public.is_household_member(public.household_id_for_purchase_payment(payment_id)));

CREATE POLICY purchase_payment_installments_insert_active
  ON public.purchase_payment_installments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_purchase_payment(payment_id))
  );

CREATE POLICY purchase_payment_installments_delete_active
  ON public.purchase_payment_installments FOR DELETE TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_purchase_payment(payment_id))
  );

REVOKE DELETE ON TABLE public.purchase_payments FROM authenticated;
REVOKE ALL ON FUNCTION public.household_id_for_purchase_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.household_id_for_purchase_payment(uuid) TO authenticated;

-- Register one or more purchase payments in a single call.
-- p_items: [{ "purchase_id": uuid, "kind": "installment"|"payoff", "count": int? }]
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
  v_deleted timestamptz;
  v_household uuid;
  v_method public.purchase_payment_method;
  v_inst record;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_inst_ids uuid[] := ARRAY[]::uuid[];
  v_covered int;
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

    IF v_purchase_id IS NULL THEN
      RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_kind NOT IN ('installment', 'payoff') THEN
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

    v_amount := 0;
    v_covered := 0;
    v_inst_ids := ARRAY[]::uuid[];

    IF v_kind = 'payoff' THEN
      -- Desparcializar / pagar de contado: cubre todo lo pendiente.
      SELECT coalesce(array_agg(id ORDER BY installment_number), ARRAY[]::uuid[]),
             coalesce(sum(amount), 0)
        INTO v_inst_ids, v_amount
        FROM public.purchase_installments
       WHERE purchase_id = v_purchase_id AND paid_at IS NULL;

      IF v_amount IS NULL OR v_amount <= 0 THEN
        -- Compra de contado u ya liquidada: registra el restante vs pagos previos.
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
        INSERT INTO public.purchase_payment_installments (payment_id, installment_id)
        SELECT v_payment_id, unnest(v_inst_ids);
      END IF;

    ELSE
      -- Paga las siguientes N cuotas pendientes.
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

      INSERT INTO public.purchase_payment_installments (payment_id, installment_id)
      SELECT v_payment_id, unnest(v_inst_ids);
    END IF;

    v_ids := array_append(v_ids, v_payment_id);
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.register_purchase_payments(uuid, uuid, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_purchase_payments(uuid, uuid, date, text, jsonb) TO authenticated;

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

  -- Reabrir cuotas cubiertas solo por este pago (si nadie más las vinculó).
  UPDATE public.purchase_installments pi
     SET paid_at = NULL
   WHERE pi.id IN (
           SELECT installment_id
             FROM public.purchase_payment_installments
            WHERE payment_id = p_payment_id
         )
     AND NOT EXISTS (
           SELECT 1
             FROM public.purchase_payment_installments ppi
             JOIN public.purchase_payments pp ON pp.id = ppi.payment_id
            WHERE ppi.installment_id = pi.id
              AND ppi.payment_id <> p_payment_id
              AND pp.deleted_at IS NULL
         );

  DELETE FROM public.purchase_payment_installments WHERE payment_id = p_payment_id;

  UPDATE public.purchase_payments
     SET deleted_at = now()
   WHERE id = p_payment_id;

  RETURN p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_purchase_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_payment(uuid) TO authenticated;
