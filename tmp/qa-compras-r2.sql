-- QA ronda 2 Compras a plazos (estricto). Datos desechables.
-- Incluye asserts de los 4 fixes: splits, ledger guard, contado abierto, integridad MSI.

CREATE TABLE IF NOT EXISTS public._qa_compras_run (
  seq integer PRIMARY KEY,
  kind text NOT NULL,
  check_id text NOT NULL,
  ok boolean NOT NULL,
  detail text
);
CREATE TABLE IF NOT EXISTS public._qa_compras_ref (
  key text PRIMARY KEY,
  id uuid NOT NULL
);

ALTER TABLE public._qa_compras_run DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._qa_compras_ref DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._qa_compras_run TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._qa_compras_ref TO authenticated;

TRUNCATE public._qa_compras_run;
TRUNCATE public._qa_compras_ref;

CREATE OR REPLACE FUNCTION pg_temp.qa_note(p_kind text, p_id text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public._qa_compras_run (seq, kind, check_id, ok, detail)
  VALUES (
    (SELECT coalesce(max(seq), 0) + 1 FROM public._qa_compras_run),
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
  v_nu uuid;
  v_liverpool uuid;
  v_costco uuid;
  v_id uuid;
  v_id2 uuid;
  v_pay uuid;
  v_bonus uuid;
  v_ids uuid[];
  v_err text;
  v_sum numeric;
  v_count int;
  v_live int;
  v_nov numeric;
  v_dec numeric;
BEGIN
  PERFORM pg_temp.clear_auth();

  DELETE FROM public.households WHERE name = 'QA Compras a plazos';
  DELETE FROM auth.users
   WHERE id IN (v_ana, v_luis, v_ajena)
      OR email IN (
        'qa.compras.ana@nido.test',
        'qa.compras.luis@nido.test',
        'qa.compras.ajena@nido.test'
      );

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_ana, 'authenticated', 'authenticated',
      'qa.compras.ana@nido.test', extensions.crypt('QaCompras-2026!', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Ana QA"}'::jsonb, now(), now(), false, false,
      '', '', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_luis, 'authenticated', 'authenticated',
      'qa.compras.luis@nido.test', extensions.crypt('QaCompras-2026!', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Luis QA"}'::jsonb, now(), now(), false, false,
      '', '', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_ajena, 'authenticated', 'authenticated',
      'qa.compras.ajena@nido.test', extensions.crypt('QaCompras-2026!', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Ajena QA"}'::jsonb, now(), now(), false, false,
      '', '', '', '', '', ''
    );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  SELECT gen_random_uuid(), u.id,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', u.id::text, now(), now(), now()
    FROM auth.users u
   WHERE u.id IN (v_ana, v_luis, v_ajena);

  UPDATE public.profiles SET display_name = 'Ana QA' WHERE id = v_ana;
  UPDATE public.profiles SET display_name = 'Luis QA' WHERE id = v_luis;
  UPDATE public.profiles SET display_name = 'Ajena QA' WHERE id = v_ajena;

  PERFORM pg_temp.set_auth(v_ana);
  SELECT id INTO v_household FROM public.create_household('QA Compras a plazos');
  PERFORM pg_temp.clear_auth();
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household, v_luis, 'member');
  INSERT INTO public._qa_compras_ref (key, id) VALUES ('household', v_household);
  PERFORM pg_temp.qa_note('setup', 'household', v_household IS NOT NULL, v_household::text);

  PERFORM pg_temp.set_auth(v_ana);
  v_bbva := public.create_payment_card(v_household, v_ana, 'BBVA Ana', 'BBVA', '4242', 15, 28);
  v_nu := public.create_payment_card(v_household, v_luis, 'Nu Luis', 'Nu', '1111', 20, 7);
  v_liverpool := public.create_payment_card(v_household, v_ana, 'Liverpool', NULL, NULL, 28, 28);
  v_costco := public.create_payment_card(v_household, v_ana, 'Costco', 'Costco', '0007', 10, 20);
  INSERT INTO public._qa_compras_ref (key, id) VALUES
    ('bbva', v_bbva), ('nu', v_nu), ('liverpool', v_liverpool), ('costco', v_costco);

  -- Escenarios de producto
  v_id := public.create_purchase(v_household, 'QA Sofá contado', 'Sala gris', 'Gaia', '2026-11-02', 8500, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🛋️');
  INSERT INTO public._qa_compras_ref VALUES ('sofa', v_id);

  v_id := public.create_purchase(v_household, 'QA Lavadora 60/40', NULL, 'Liverpool', '2026-11-04', 12000, 'cash', 12, v_bbva, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 60), jsonb_build_object('member_id', v_luis, 'percent', 40)), jsonb_build_array(jsonb_build_object('bonus_type', 'cashback', 'label', 'Cashback BBVA', 'amount', 1000, 'expected_at', '2026-12-15'), jsonb_build_object('bonus_type', 'deferred_discount', 'label', 'Promo', 'amount', 500, 'expected_at', '2027-01-15')), '🧺');
  INSERT INTO public._qa_compras_ref VALUES ('lavadora', v_id);

  v_id := public.create_purchase(v_household, 'QA Refri MSI 3', NULL, 'Elektra', '2026-11-10', 1000, 'msi', 3, v_bbva, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🧊');
  INSERT INTO public._qa_compras_ref VALUES ('refri', v_id);

  v_id := public.create_purchase(v_household, 'QA Comedor post-corte', NULL, 'Palliser', '2026-11-21', 6000, 'msi', 6, v_bbva, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 50), jsonb_build_object('member_id', v_luis, 'percent', 50)), '[]'::jsonb, '🍽️');
  INSERT INTO public._qa_compras_ref VALUES ('comedor', v_id);

  v_id := public.create_purchase(v_household, 'QA Horno antes de corte', NULL, 'Mabe', '2026-11-18', 2400, 'msi', 4, v_nu, NULL, jsonb_build_array(jsonb_build_object('member_id', v_luis, 'percent', 100)), '[]'::jsonb, '🔥');
  INSERT INTO public._qa_compras_ref VALUES ('horno', v_id);

  v_id := public.create_purchase(v_household, 'QA TV 12 parejo', NULL, 'Samsung', '2026-11-03', 12000, 'msi', 12, v_bbva, '2026-11-05', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '📺');
  INSERT INTO public._qa_compras_ref VALUES ('tv', v_id);

  v_id := public.create_purchase(v_household, 'QA Lámpara 2 meses', NULL, NULL, '2026-10-02', 500.01, 'msi', 2, v_bbva, '2026-10-28', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '💡');
  INSERT INTO public._qa_compras_ref VALUES ('lampara', v_id);

  v_id := public.create_purchase(v_household, 'QA Persiana 48', NULL, NULL, '2026-11-01', 48.47, 'msi', 48, v_liverpool, '2027-01-15', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🪟');
  INSERT INTO public._qa_compras_ref VALUES ('persiana', v_id);

  v_id := public.create_purchase(v_household, 'QA Colchón niño ñoño', 'Matrimonial', 'IKEA', '2026-11-12', 9999.99, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 33.33), jsonb_build_object('member_id', v_luis, 'percent', 66.67)), '[]'::jsonb, '🛏️');
  INSERT INTO public._qa_compras_ref VALUES ('colchon', v_id);

  v_id := public.create_purchase(v_household, 'QA Dos bonos', NULL, 'Amazon', '2026-11-06', 12000, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), jsonb_build_array(jsonb_build_object('bonus_type', 'cashback', 'label', 'Prime', 'amount', 1000, 'expected_at', '2026-12-01'), jsonb_build_object('bonus_type', 'deferred_discount', 'label', 'Vale', 'amount', 500, 'expected_at', '2026-12-20')), '📦');
  INSERT INTO public._qa_compras_ref VALUES ('bonos', v_id);
  SELECT id INTO v_bonus FROM public.purchase_bonuses WHERE purchase_id = v_id AND label = 'Prime';
  PERFORM public.update_purchase_bonus(v_bonus, 'Prime', 1000, '2026-12-01', '2026-11-18', NULL);

  v_id := public.create_purchase(v_household, 'QA Liquidada', NULL, NULL, '2026-09-01', 900, 'msi', 3, v_bbva, '2026-09-28', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '✅');
  INSERT INTO public._qa_compras_ref VALUES ('liquidada', v_id);
  v_ids := public.register_purchase_payments(v_household, v_ana, '2026-11-01', 'liquidar', jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'payoff')));

  v_id := public.create_purchase(v_household, 'QA Parcial dos cuotas', NULL, NULL, '2026-11-08', 1000, 'msi', 6, v_bbva, '2026-11-15', jsonb_build_array(jsonb_build_object('member_id', v_luis, 'percent', 100)), '[]'::jsonb, '🧹');
  INSERT INTO public._qa_compras_ref VALUES ('parcial', v_id);
  PERFORM public.register_purchase_payments(v_household, v_luis, '2026-11-16', NULL, jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'installment', 'count', 2)));

  v_id := public.create_purchase(v_household, 'QA Abono capital', NULL, NULL, '2026-11-09', 1000, 'msi', 6, v_bbva, '2026-11-20', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🪴');
  INSERT INTO public._qa_compras_ref VALUES ('capital', v_id);
  PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-17', 'abono', jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'capital', 'amount', 200)));

  v_id := public.create_purchase(v_household, 'QA Capital exacto', NULL, NULL, '2026-11-07', 900, 'msi', 3, v_nu, '2026-11-10', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🚿');
  INSERT INTO public._qa_compras_ref VALUES ('exacto', v_id);
  PERFORM public.register_purchase_payments(v_household, v_luis, '2026-11-17', NULL, jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'capital', 'amount', 300)));

  v_id := public.create_purchase(v_household, 'QA Contado abonado', NULL, NULL, '2026-11-05', 4000, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🪑');
  INSERT INTO public._qa_compras_ref VALUES ('abonado', v_id);
  PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-11', 'anticipo', jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'capital', 'amount', 1500)));

  v_id := public.create_purchase(v_household, 'QA Contado pendiente', NULL, NULL, '2026-11-06', 3000, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🧾');
  INSERT INTO public._qa_compras_ref VALUES ('contado-pendiente', v_id);

  v_id := public.create_purchase(v_household, 'QA Pago deshecho', NULL, NULL, '2026-11-11', 900, 'msi', 3, v_bbva, '2026-11-18', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '↩️');
  INSERT INTO public._qa_compras_ref VALUES ('deshecho', v_id);
  v_ids := public.register_purchase_payments(v_household, v_ana, '2026-11-18', 'cancelar', jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'installment', 'count', 1)));
  PERFORM public.soft_delete_purchase_payment(v_ids[1]);

  v_id := public.create_purchase(v_household, 'QA Marcada a mano', NULL, NULL, '2026-11-08', 900, 'msi', 3, v_bbva, '2026-11-08', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🖊️');
  INSERT INTO public._qa_compras_ref VALUES ('manual', v_id);
  SELECT id INTO v_pay FROM public.purchase_installments WHERE purchase_id = v_id AND installment_number = 1;
  PERFORM public.mark_purchase_installment_paid(v_pay, '2026-11-08');

  v_id := public.create_purchase(v_household, 'QA Eliminada', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🗑️');
  PERFORM public.soft_delete_purchase(v_id);
  INSERT INTO public._qa_compras_ref VALUES ('eliminada', v_id);

  v_id := public.create_purchase(v_household, 'QA Bono después', NULL, NULL, '2026-11-13', 3000, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '🎁');
  INSERT INTO public._qa_compras_ref VALUES ('bono-despues', v_id);
  PERFORM public.create_purchase_bonus(v_id, 'cashback', 'Devolución', 250, '2026-12-01', NULL);

  v_id := public.create_purchase(v_household, 'QA Override fecha', NULL, NULL, '2026-11-20', 300, 'msi', 3, v_bbva, '2026-11-01', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '📅');
  INSERT INTO public._qa_compras_ref VALUES ('override', v_id);

  v_id := public.create_purchase(v_household, 'QA Sin emoji', NULL, NULL, '2026-11-14', 750, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL);
  INSERT INTO public._qa_compras_ref VALUES ('sin-emoji', v_id);

  v_id := public.create_purchase(v_household, '  QA Cien por ciento Luis  ', NULL, NULL, '2026-08-15', 2200, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_luis, 'percent', 100)), '[]'::jsonb, '👤');
  INSERT INTO public._qa_compras_ref VALUES ('luis', v_id);

  v_id := public.create_purchase(v_household, 'QA Junio histórico', NULL, NULL, '2026-06-15', 2000, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '📅');
  INSERT INTO public._qa_compras_ref VALUES ('junio', v_id);

  v_id := public.create_purchase(v_household, 'QA Futura diciembre', NULL, NULL, '2026-12-01', 1800, 'msi', 3, v_nu, '2027-01-10', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '📦');
  INSERT INTO public._qa_compras_ref VALUES ('futura', v_id);

  v_id := public.create_purchase(v_household, 'QA Lote cuota', NULL, NULL, '2026-11-19', 300, 'msi', 3, v_bbva, '2026-12-01', jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, '1️⃣');
  v_id2 := public.create_purchase(v_household, 'QA Lote capital', NULL, NULL, '2026-11-19', 300, 'msi', 3, v_bbva, '2026-12-01', jsonb_build_array(jsonb_build_object('member_id', v_luis, 'percent', 100)), '[]'::jsonb, '2️⃣');
  INSERT INTO public._qa_compras_ref VALUES ('lote-cuota', v_id), ('lote-capital', v_id2);
  v_ids := public.register_purchase_payments(v_household, v_ana, '2026-11-18', 'lote', jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'kind', 'installment', 'count', 1), jsonb_build_object('purchase_id', v_id2, 'kind', 'capital', 'amount', 50)));
  PERFORM pg_temp.qa_note('assert', 'lote-dos-pagos', coalesce(array_length(v_ids, 1), 0) = 2, coalesce(array_length(v_ids, 1), 0)::text);

  -- FIX: no deshacer cuota con ledger
  SELECT id INTO v_pay FROM public.purchase_installments
   WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'liquidada')
     AND installment_number = 1;
  BEGIN
    PERFORM public.mark_purchase_installment_paid(v_pay, NULL);
    PERFORM pg_temp.qa_note('fix', 'ledger-guard-clear', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('fix', 'ledger-guard-clear', SQLERRM ILIKE '%conflict%', SQLERRM);
  END;

  -- FIX: splits
  BEGIN
    PERFORM public.create_purchase(v_household, 'QA NO split-dup', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 50), jsonb_build_object('member_id', v_ana, 'percent', 50)), '[]'::jsonb, NULL);
    PERFORM pg_temp.qa_note('fix', 'split-duplicado', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('fix', 'split-duplicado', SQLERRM ILIKE '%invalid_split%', SQLERRM);
  END;
  BEGIN
    PERFORM public.create_purchase(v_household, 'QA NO ajena', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ajena, 'percent', 100)), '[]'::jsonb, NULL);
    PERFORM pg_temp.qa_note('fix', 'miembro-ajeno', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('fix', 'miembro-ajeno', SQLERRM ILIKE '%invalid_split%', SQLERRM);
  END;

  -- Tarjetas
  BEGIN
    PERFORM public.soft_delete_payment_card(v_bbva);
    PERFORM pg_temp.qa_note('reject', 'borrar-tarjeta-con-compras', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('reject', 'borrar-tarjeta-con-compras', SQLERRM ILIKE '%card_in_use%' OR SQLERRM ILIKE '%conflict%', SQLERRM);
  END;
  PERFORM public.soft_delete_payment_card(v_costco);
  BEGIN
    PERFORM public.soft_delete_payment_card(v_costco);
    PERFORM pg_temp.qa_note('reject', 'borrar-tarjeta-dos-veces', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('reject', 'borrar-tarjeta-dos-veces', SQLERRM ILIKE '%card_deleted%', SQLERRM);
  END;

  -- Rechazos generales
  BEGIN PERFORM public.create_purchase(v_household, 'QA NO msi-1', NULL, NULL, '2026-11-01', 100, 'msi', 1, v_bbva, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'msi-1', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'msi-1', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.create_purchase(v_household, 'QA NO msi-49', NULL, NULL, '2026-11-01', 100, 'msi', 49, v_bbva, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'msi-49', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'msi-49', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.create_purchase(v_household, 'QA NO sin-tarjeta', NULL, NULL, '2026-11-01', 100, 'msi', 3, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'msi-sin-tarjeta', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'msi-sin-tarjeta', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.create_purchase(v_household, '   ', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'nombre-vacio', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'nombre-vacio', SQLERRM ILIKE '%invalid_name%', SQLERRM); END;
  BEGIN PERFORM public.create_purchase(v_household, repeat('A', 81), NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'nombre-81', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'nombre-81', SQLERRM ILIKE '%invalid_name%', SQLERRM); END;
  BEGIN PERFORM public.create_purchase(v_household, 'QA NO monto-0', NULL, NULL, '2026-11-01', 0, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'monto-0', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'monto-0', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.create_purchase(v_household, 'QA NO split-90', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 90)), '[]'::jsonb, NULL); PERFORM pg_temp.qa_note('reject', 'split-90', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'split-90', SQLERRM ILIKE '%invalid_split%', SQLERRM); END;
  BEGIN PERFORM public.create_payment_card(v_household, v_ana, 'Mala', 'BBVA', '12', 15, 28); PERFORM pg_temp.qa_note('reject', 'last-four', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'last-four', SQLERRM ILIKE '%invalid_name%', SQLERRM); END;
  BEGIN PERFORM public.create_payment_card(v_household, v_ana, 'Mala', NULL, NULL, 0, 28); PERFORM pg_temp.qa_note('reject', 'cut-0', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'cut-0', SQLERRM ILIKE '%invalid_date%', SQLERRM); END;
  BEGIN PERFORM public.create_payment_card(v_household, v_ana, 'Mala', NULL, NULL, 29, 28); PERFORM pg_temp.qa_note('reject', 'cut-29', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'cut-29', SQLERRM ILIKE '%invalid_date%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', NULL, jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'refri'), 'kind', 'capital', 'amount', 5000))); PERFORM pg_temp.qa_note('reject', 'capital-mayor', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'capital-mayor', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', NULL, jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'liquidada'), 'kind', 'installment', 'count', 1))); PERFORM pg_temp.qa_note('reject', 'cuota-ya-liquidada', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'cuota-ya-liquidada', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', NULL, jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'liquidada'), 'kind', 'payoff'))); PERFORM pg_temp.qa_note('reject', 'payoff-ya-cubierto', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'payoff-ya-cubierto', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', repeat('n', 201), jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'refri'), 'kind', 'installment', 'count', 1))); PERFORM pg_temp.qa_note('reject', 'notas-201', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'notas-201', SQLERRM ILIKE '%invalid_name%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', NULL, jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'eliminada'), 'kind', 'capital', 'amount', 10))); PERFORM pg_temp.qa_note('reject', 'pago-compra-eliminada', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'pago-compra-eliminada', SQLERRM ILIKE '%purchase_deleted%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', NULL, jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'refri'), 'kind', 'nope'))); PERFORM pg_temp.qa_note('reject', 'kind-invalido', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'kind-invalido', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;
  BEGIN PERFORM public.register_purchase_payments(v_household, v_ana, '2026-11-18', NULL, jsonb_build_array(jsonb_build_object('purchase_id', (SELECT id FROM public._qa_compras_ref WHERE key = 'refri'), 'kind', 'installment', 'count', 0))); PERFORM pg_temp.qa_note('reject', 'count-0', false, 'ok');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.qa_note('reject', 'count-0', SQLERRM ILIKE '%invalid_amount%', SQLERRM); END;

  PERFORM pg_temp.clear_auth();
  BEGIN
    PERFORM public.create_purchase(v_household, 'QA NO unauth', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL);
    PERFORM pg_temp.qa_note('reject', 'sin-sesion', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('reject', 'sin-sesion', SQLERRM ILIKE '%unauthenticated%', SQLERRM);
  END;

  PERFORM pg_temp.set_auth(v_ajena);
  BEGIN
    PERFORM public.create_purchase(v_household, 'QA NO ajena-crea', NULL, NULL, '2026-11-01', 100, 'cash', NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('member_id', v_ana, 'percent', 100)), '[]'::jsonb, NULL);
    PERFORM pg_temp.qa_note('reject', 'ajena-no-crea', false, 'se permitió');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.qa_note('reject', 'ajena-no-crea', SQLERRM ILIKE '%not_a_member%', SQLERRM);
  END;
  SELECT count(*) INTO v_count FROM public.purchases WHERE household_id = v_household;
  PERFORM pg_temp.qa_note('rls', 'ajena-no-lee', v_count = 0, v_count::text);

  PERFORM pg_temp.set_auth(v_luis);
  SELECT count(*) INTO v_count FROM public.purchases WHERE household_id = v_household AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('rls', 'luis-lee-activas', v_count = 26, v_count::text);

  PERFORM pg_temp.set_auth(v_ana);

  SELECT count(*) INTO v_count
    FROM public.purchases p
   WHERE p.household_id = v_household AND p.deleted_at IS NULL AND p.payment_method = 'msi'
     AND (SELECT count(*) FROM public.purchase_installments i WHERE i.purchase_id = p.id) <> p.msi_months;
  PERFORM pg_temp.qa_note('assert', 'msi-conteo-meses', v_count = 0, 'desviaciones=' || v_count);

  SELECT count(*) INTO v_count
    FROM public.purchases p
   WHERE p.household_id = v_household AND p.deleted_at IS NULL AND p.payment_method = 'msi'
     AND NOT EXISTS (SELECT 1 FROM public.purchase_payments pp WHERE pp.purchase_id = p.id AND pp.deleted_at IS NULL)
     AND coalesce((SELECT sum(i.amount) FROM public.purchase_installments i WHERE i.purchase_id = p.id), 0) <> p.gross_amount;
  PERFORM pg_temp.qa_note('assert', 'msi-suma-sin-pagos', v_count = 0, 'desviaciones=' || v_count);

  -- After capital: open installment amounts + capital payments = gross
  -- (paid cuotas keep their amount; do not sum them or you double-count vs capital)
  SELECT coalesce(sum(i.amount) FILTER (WHERE i.paid_at IS NULL), 0)
       + coalesce((
           SELECT sum(pp.amount)
             FROM public.purchase_payments pp
            WHERE pp.purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'capital')
              AND pp.deleted_at IS NULL
              AND pp.kind = 'capital'
         ), 0)
    INTO v_sum
    FROM public.purchase_installments i
   WHERE i.purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'capital');
  PERFORM pg_temp.qa_note('assert', 'capital-conserva-gross', v_sum = 1000, v_sum::text);

  SELECT coalesce(sum(i.amount) FILTER (WHERE i.paid_at IS NULL), 0)
       + coalesce((
           SELECT sum(pp.amount)
             FROM public.purchase_payments pp
            WHERE pp.purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lote-capital')
              AND pp.deleted_at IS NULL
              AND pp.kind = 'capital'
         ), 0)
    INTO v_sum
    FROM public.purchase_installments i
   WHERE i.purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lote-capital');
  PERFORM pg_temp.qa_note('assert', 'lote-capital-conserva-gross', v_sum = 300, v_sum::text);

  SELECT count(*) INTO v_count
    FROM public.purchases p
   WHERE p.household_id = v_household AND p.deleted_at IS NULL AND p.payment_method = 'cash'
     AND (p.msi_months IS NOT NULL OR EXISTS (SELECT 1 FROM public.purchase_installments i WHERE i.purchase_id = p.id));
  PERFORM pg_temp.qa_note('assert', 'contado-sin-cuotas', v_count = 0, 'desviaciones=' || v_count);

  SELECT count(*) INTO v_count
    FROM public.purchases p
   WHERE p.household_id = v_household AND p.deleted_at IS NULL
     AND (SELECT round(coalesce(sum(s.percent), 0), 2) FROM public.purchase_shares s WHERE s.purchase_id = p.id) <> 100;
  PERFORM pg_temp.qa_note('assert', 'shares-100', v_count = 0, 'desviaciones=' || v_count);

  SELECT count(*) INTO v_count FROM public.purchases WHERE household_id = v_household AND name LIKE 'QA NO%';
  PERFORM pg_temp.qa_note('assert', 'rechazos-sin-filas', v_count = 0, v_count::text);

  SELECT name INTO v_err FROM public.purchases WHERE id = (SELECT id FROM public._qa_compras_ref WHERE key = 'luis');
  PERFORM pg_temp.qa_note('assert', 'nombre-recortado', v_err = 'QA Cien por ciento Luis', coalesce(v_err, ''));

  -- Contado ignores MSI months AND residual card_id (cleared server-side).
  SELECT CASE WHEN msi_months IS NULL AND card_id IS NULL THEN 1 ELSE 0 END INTO v_count
    FROM public.purchases WHERE id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lavadora');
  PERFORM pg_temp.qa_note(
    'assert', 'contado-ignora-meses',
    v_count = 1,
    (SELECT format('msi=%s card=%s', msi_months::text, card_id::text)
       FROM public.purchases WHERE id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lavadora'))
  );

  SELECT due_date INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'refri') AND installment_number = 1;
  PERFORM pg_temp.qa_note('assert', 'refri-primera', v_err = '2026-11-28', v_err);
  SELECT string_agg(amount::text, ',' ORDER BY installment_number) INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'refri');
  PERFORM pg_temp.qa_note('assert', 'refri-montos', v_err = '333.33,333.33,333.34', coalesce(v_err, ''));

  SELECT due_date INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'comedor') AND installment_number = 1;
  PERFORM pg_temp.qa_note('assert', 'comedor-primera', v_err = '2026-12-28', v_err);
  SELECT due_date INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'horno') AND installment_number = 1;
  PERFORM pg_temp.qa_note('assert', 'horno-primera', v_err = '2026-12-07', v_err);
  SELECT due_date INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'override') AND installment_number = 1;
  PERFORM pg_temp.qa_note('assert', 'override-primera', v_err = '2026-11-01', v_err);
  SELECT string_agg(amount::text, ',' ORDER BY installment_number) INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lampara');
  PERFORM pg_temp.qa_note('assert', 'lampara-montos', v_err = '250.00,250.01', coalesce(v_err, ''));

  SELECT count(*) FILTER (WHERE amount = 1.00), count(*) FILTER (WHERE amount = 1.47)
    INTO v_count, v_live FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'persiana');
  PERFORM pg_temp.qa_note('assert', 'persiana-residuo', v_count = 47 AND v_live = 1, v_count::text || '/' || v_live::text);

  SELECT count(*) FILTER (WHERE paid_at IS NULL) INTO v_count FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'liquidada');
  SELECT coalesce(sum(amount), 0) INTO v_sum FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'liquidada') AND deleted_at IS NULL AND kind = 'payoff';
  PERFORM pg_temp.qa_note('assert', 'liquidada', v_count = 0 AND v_sum = 900, 'pendientes=' || v_count || ' pago=' || v_sum);

  SELECT coalesce(sum(amount), 0) INTO v_sum FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'parcial') AND deleted_at IS NULL;
  SELECT count(*) FILTER (WHERE paid_at IS NULL) INTO v_count FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'parcial');
  PERFORM pg_temp.qa_note('assert', 'parcial', v_sum = 333.32 AND v_count = 4, 'pago=' || v_sum || ' pendientes=' || v_count);

  SELECT string_agg(installment_number::text || ':' || amount::text || ':' || (paid_at IS NOT NULL)::text, ',' ORDER BY installment_number)
    INTO v_err FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'capital');
  PERFORM pg_temp.qa_note('assert', 'capital-cola', v_err = '1:166.66:false,2:166.66:false,3:166.66:false,4:166.66:false,5:133.36:false,6:166.70:true', coalesce(v_err, ''));

  SELECT CASE WHEN paid_at IS NOT NULL AND amount = 300 THEN 1 ELSE 0 END INTO v_count
    FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'exacto') AND installment_number = 3;
  PERFORM pg_temp.qa_note('assert', 'capital-exacto', v_count = 1, '');

  SELECT count(*) INTO v_count FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'abonado');
  SELECT amount, kind INTO v_sum, v_err FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'abonado') AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('assert', 'contado-capital', v_count = 0 AND v_sum = 1500 AND v_err = 'capital', v_err || ' ' || v_sum);

  -- FIX contado: open balance = 2500
  SELECT 4000 - coalesce(sum(amount),0) INTO v_sum FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'abonado') AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('fix', 'contado-open-balance', v_sum = 2500, v_sum::text);
  SELECT 3000 - coalesce(sum(amount),0) INTO v_sum FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'contado-pendiente') AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('fix', 'contado-sin-pago-balance', v_sum = 3000, v_sum::text);

  SELECT count(*) FILTER (WHERE paid_at IS NULL) INTO v_count FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'deshecho');
  SELECT count(*) INTO v_live FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'deshecho') AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('assert', 'deshacer-restaura', v_count = 3 AND v_live = 0, 'pendientes=' || v_count || ' pagos-vivos=' || v_live);

  SELECT count(*) INTO v_count FROM public.purchase_payments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'manual') AND deleted_at IS NULL;
  SELECT count(*) FILTER (WHERE paid_at IS NOT NULL) INTO v_live FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'manual');
  PERFORM pg_temp.qa_note('assert', 'marca-manual-sin-ledger', v_count = 0 AND v_live = 1, 'pagos=' || v_count || ' pagadas=' || v_live);

  -- Orphan clear allowed
  SELECT id INTO v_pay FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'manual') AND installment_number = 1;
  PERFORM public.mark_purchase_installment_paid(v_pay, NULL);
  SELECT CASE WHEN paid_at IS NULL THEN 1 ELSE 0 END INTO v_count FROM public.purchase_installments WHERE id = v_pay;
  PERFORM pg_temp.qa_note('fix', 'orphan-clear-allowed', v_count = 1, '');
  -- restore orphan for UI check of "Marcar pendiente"
  PERFORM public.mark_purchase_installment_paid(v_pay, '2026-11-08');

  SELECT CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END INTO v_count FROM public.purchases WHERE id = (SELECT id FROM public._qa_compras_ref WHERE key = 'eliminada');
  PERFORM pg_temp.qa_note('assert', 'eliminada-oculta', v_count = 1, '');

  SELECT count(*) FILTER (WHERE received_at IS NOT NULL), count(*) INTO v_count, v_live
    FROM public.purchase_bonuses WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'bonos') AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('assert', 'bono-recibido', v_count = 1 AND v_live = 2, v_count::text || '/' || v_live::text);

  SELECT count(*) INTO v_count FROM public.purchase_bonuses WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'bono-despues') AND deleted_at IS NULL AND amount = 250;
  PERFORM pg_temp.qa_note('assert', 'bono-posterior', v_count = 1, v_count::text);

  SELECT CASE WHEN emoji IS NULL THEN 1 ELSE 0 END INTO v_count FROM public.purchases WHERE id = (SELECT id FROM public._qa_compras_ref WHERE key = 'sin-emoji');
  PERFORM pg_temp.qa_note('assert', 'emoji-nulo', v_count = 1, '');

  SELECT amount INTO v_sum FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lote-capital') AND installment_number = 3;
  SELECT count(*) FILTER (WHERE paid_at IS NOT NULL) INTO v_count FROM public.purchase_installments WHERE purchase_id = (SELECT id FROM public._qa_compras_ref WHERE key = 'lote-cuota');
  PERFORM pg_temp.qa_note('assert', 'lote', v_sum = 50 AND v_count = 1, 'ultima=' || v_sum || ' pagadas=' || v_count);

  SELECT count(*) INTO v_live FROM public.payment_cards WHERE household_id = v_household AND deleted_at IS NULL;
  PERFORM pg_temp.qa_note('assert', 'tarjetas-vivas', v_live = 3, v_live::text);

  SELECT coalesce(sum(i.amount), 0) INTO v_nov
    FROM public.purchase_installments i
    JOIN public.purchases p ON p.id = i.purchase_id
   WHERE p.household_id = v_household AND p.deleted_at IS NULL
     AND i.paid_at IS NULL AND i.due_date BETWEEN '2026-11-01' AND '2026-11-30';
  SELECT coalesce(sum(i.amount), 0) INTO v_dec
    FROM public.purchase_installments i
    JOIN public.purchases p ON p.id = i.purchase_id
   WHERE p.household_id = v_household AND p.deleted_at IS NULL
     AND i.paid_at IS NULL AND i.due_date BETWEEN '2026-12-01' AND '2026-12-31';
  SELECT count(*) INTO v_live FROM public.purchases WHERE household_id = v_household AND deleted_at IS NULL;

  PERFORM pg_temp.qa_note('totals', 'noviembre', true, v_nov::text);
  PERFORM pg_temp.qa_note('totals', 'diciembre', true, v_dec::text);
  PERFORM pg_temp.qa_note('totals', 'compras-vivas', true, v_live::text);
  PERFORM pg_temp.qa_note('assert', 'noviembre-2450', v_nov = 2450, v_nov::text);

  SELECT coalesce(sum(p.gross_amount - coalesce(b.bonus_sum,0)),0) INTO v_sum
    FROM public.purchases p
    LEFT JOIN LATERAL (
      SELECT sum(amount) AS bonus_sum FROM public.purchase_bonuses WHERE purchase_id = p.id AND deleted_at IS NULL
    ) b ON true
   WHERE p.household_id = v_household AND p.deleted_at IS NULL;
  PERFORM pg_temp.qa_note('totals', 'neto-con-bono', true, v_sum::text);

  INSERT INTO public._qa_compras_run (seq, kind, check_id, ok, detail)
  SELECT (SELECT coalesce(max(seq), 0) FROM public._qa_compras_run) + row_number() OVER (ORDER BY p.purchased_at DESC, p.name),
         'snapshot', p.name, true,
         format('method=%s gross=%s net=%s unpaid=%s unpaid_sum=%s nov=%s payments=%s',
           p.payment_method, p.gross_amount,
           p.gross_amount - coalesce((SELECT sum(b.amount) FROM public.purchase_bonuses b WHERE b.purchase_id = p.id AND b.deleted_at IS NULL), 0),
           (SELECT count(*) FROM public.purchase_installments i WHERE i.purchase_id = p.id AND i.paid_at IS NULL),
           coalesce((SELECT sum(i.amount) FROM public.purchase_installments i WHERE i.purchase_id = p.id AND i.paid_at IS NULL), 0),
           coalesce((SELECT sum(i.amount) FROM public.purchase_installments i WHERE i.purchase_id = p.id AND i.paid_at IS NULL AND i.due_date BETWEEN '2026-11-01' AND '2026-11-30'), 0),
           coalesce((SELECT string_agg(pp.kind || ' ' || pp.amount, ',') FROM public.purchase_payments pp WHERE pp.purchase_id = p.id AND pp.deleted_at IS NULL), '-')
         )
    FROM public.purchases p
   WHERE p.household_id = v_household AND p.deleted_at IS NULL;

  PERFORM pg_temp.clear_auth();
END;
$$;

SELECT kind, check_id, ok, detail
  FROM public._qa_compras_run
 WHERE kind <> 'snapshot'
 ORDER BY seq;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total
  FROM public._qa_compras_run
 WHERE kind <> 'snapshot';
