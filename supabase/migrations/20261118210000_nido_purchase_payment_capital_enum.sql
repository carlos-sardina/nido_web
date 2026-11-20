-- Add capital payment kind (separate from function use; enum values need their own migration).

ALTER TYPE public.purchase_payment_kind ADD VALUE IF NOT EXISTS 'capital';

ALTER TABLE public.purchase_payment_installments
  ADD COLUMN IF NOT EXISTS applied_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reduced_remaining boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_payment_installments.applied_amount IS
  'Monto de este pago aplicado a la cuota (total o abono parcial a capital).';
COMMENT ON COLUMN public.purchase_payment_installments.reduced_remaining IS
  'True si el pago redujo el monto de la cuota sin liquidarla.';
