-- =====================================================
-- MIGRAÇÃO: tenant (text) → portal_id (integer)
-- =====================================================
-- Este script migra os dados existentes do campo 'tenant'
-- para o campo 'portal_id' seguindo a arquitetura multi-tenant

-- ===== 1. GARANTIR QUE OS PORTAIS EXISTEM =====

-- Criar portais se não existirem
INSERT INTO portals (name) VALUES ('Famalicão')
ON CONFLICT (name) DO NOTHING;

INSERT INTO portals (name) VALUES ('Braga')
ON CONFLICT (name) DO NOTHING;

INSERT INTO portals (name) VALUES ('Vila Verde')
ON CONFLICT (name) DO NOTHING;

-- ===== 2. GARANTIR QUE A COLUNA portal_id EXISTE =====

-- Adicionar coluna portal_id se não existir
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS portal_id INTEGER REFERENCES portals(id) ON DELETE CASCADE;

-- ===== 3. MIGRAR DADOS DO CAMPO tenant PARA portal_id =====

-- Mapear tenant 'famalicao' → portal_id 1
UPDATE appointments 
SET portal_id = (SELECT id FROM portals WHERE name = 'Famalicão')
WHERE (tenant = 'famalicao' OR tenant = 'famalicão' OR tenant = 'default')
  AND portal_id IS NULL;

-- Mapear tenant 'braga' → portal_id 2
UPDATE appointments 
SET portal_id = (SELECT id FROM portals WHERE name = 'Braga')
WHERE tenant = 'braga'
  AND portal_id IS NULL;

-- Mapear tenant 'vilaverde' → portal_id 3
UPDATE appointments 
SET portal_id = (SELECT id FROM portals WHERE name = 'Vila Verde')
WHERE (tenant = 'vilaverde' OR tenant = 'vila-verde')
  AND portal_id IS NULL;

-- Qualquer registo sem tenant ou com tenant desconhecido → Famalicão (default)
UPDATE appointments 
SET portal_id = (SELECT id FROM portals WHERE name = 'Famalicão')
WHERE portal_id IS NULL;

-- ===== 4. TORNAR portal_id OBRIGATÓRIO =====

-- Agora que todos os registos têm portal_id, tornar a coluna NOT NULL
ALTER TABLE appointments 
ALTER COLUMN portal_id SET NOT NULL;

-- ===== 5. REMOVER CAMPO tenant (OPCIONAL) =====

-- Descomentar as linhas abaixo se quiser remover completamente o campo tenant
-- ATENÇÃO: Isto é irreversível!

-- DROP INDEX IF EXISTS idx_appointments_tenant_date;
-- DROP INDEX IF EXISTS idx_appointments_tenant_status;
-- ALTER TABLE appointments DROP COLUMN IF EXISTS tenant;

-- ===== 6. CRIAR/ATUALIZAR ÍNDICES =====

-- Criar índices para performance com portal_id
CREATE INDEX IF NOT EXISTS idx_appointments_portal_id ON appointments(portal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_portal_date ON appointments(portal_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_portal_status ON appointments(portal_id, status);

-- ===== 7. VERIFICAÇÃO =====

-- Verificar distribuição de agendamentos por portal
SELECT 
  p.id,
  p.name,
  COUNT(a.id) as appointment_count
FROM portals p
LEFT JOIN appointments a ON p.id = a.portal_id
GROUP BY p.id, p.name
ORDER BY p.id;

-- Verificar se há algum registo sem portal_id (não deve haver)
SELECT COUNT(*) as registos_sem_portal
FROM appointments
WHERE portal_id IS NULL;

-- ===== RESULTADO ESPERADO =====
-- Todos os agendamentos devem ter um portal_id válido
-- O campo tenant pode ser mantido para compatibilidade ou removido
-- Os índices estão otimizados para queries por portal_id

