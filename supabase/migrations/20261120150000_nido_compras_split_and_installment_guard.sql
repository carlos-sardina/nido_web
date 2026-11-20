-- Compras a plazos: códigos claros en splits y no deshacer cuotas con ledger.

CREATE OR REPLACE FUNCTION public.replace_purchase_shares(
  p_purchase_id uuid,
  p_shares jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_member_id uuid;
  v_percent numeric(5, 2);
  v_total numeric(8, 2) := 0;
  v_count int := 0;
  v_household_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_shares IS NULL OR jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) < 1 THEN
    RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id INTO v_household_id
    FROM public.purchases
   WHERE id = p_purchase_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.purchase_shares WHERE purchase_id = p_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_member_id := (v_item->>'member_id')::uuid;
    v_percent := round((v_item->>'percent')::numeric, 2);
    IF v_member_id IS NULL OR v_percent IS NULL OR v_percent <= 0 OR v_percent > 100 THEN
      RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
    END IF;
    IF v_member_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.is_active_member_of(v_household_id, v_member_id) THEN
      RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.purchase_shares (purchase_id, member_id, percent)
    VALUES (p_purchase_id, v_member_id, v_percent);
    v_seen := array_append(v_seen, v_member_id);
    v_total := v_total + v_percent;
    v_count := v_count + 1;
  END LOOP;

  IF v_count < 1 OR round(v_total, 2) <> 100.00 THEN
    RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_purchase_installment_paid(
  p_installment_id uuid,
  p_paid_at date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_purchase_id uuid;
  v_household_id uuid;
  v_deleted timestamptz;
  v_linked int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT purchase_id INTO v_purchase_id
    FROM public.purchase_installments WHERE id = p_installment_id;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'nido.installment_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = v_purchase_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  -- Cuotas ligadas a un pago del ledger solo se revierten con soft_delete_purchase_payment.
  IF p_paid_at IS NULL THEN
    SELECT count(*)::int INTO v_linked
      FROM public.purchase_payment_installments ppi
      JOIN public.purchase_payments pp ON pp.id = ppi.payment_id
     WHERE ppi.installment_id = p_installment_id
       AND pp.deleted_at IS NULL
       AND ppi.reduced_remaining = false;
    IF v_linked > 0 THEN
      RAISE EXCEPTION 'nido.conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.purchase_installments
     SET paid_at = p_paid_at
   WHERE id = p_installment_id;

  RETURN p_installment_id;
END;
$$;
