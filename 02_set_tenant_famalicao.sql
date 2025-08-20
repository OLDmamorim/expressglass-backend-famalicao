-- 02_set_tenant_famalicao.sql
UPDATE public.appointments SET tenant = 'famalicao' WHERE tenant = 'default';