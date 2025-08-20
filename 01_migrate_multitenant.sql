-- 01_migrate_multitenant.sql
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS tenant text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date
  ON public.appointments (tenant, date);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status
  ON public.appointments (tenant, status);