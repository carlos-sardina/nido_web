-- Grant table privileges for purchase payment ledger (RLS still applies).

REVOKE ALL ON TABLE public.purchase_payments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchase_payment_installments FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.purchase_payments TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.purchase_payment_installments TO authenticated;

REVOKE DELETE ON TABLE public.purchase_payments FROM authenticated;
