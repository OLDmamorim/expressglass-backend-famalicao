-- =====================================================
-- EXPRESSGLASS FAMALICÃO - ESTRUTURA MULTI-TENANT
-- =====================================================
-- Schema adaptado: Portais SEM localidades e SEM morada de partida
-- Apenas nome do portal é necessário

-- ===== TABELA DE PORTAIS =====
CREATE TABLE IF NOT EXISTS portals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TABELA DE UTILIZADORES =====
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  portal_id INTEGER REFERENCES portals(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== MODIFICAR TABELA DE AGENDAMENTOS =====
-- Adicionar portal_id para isolamento multi-tenant
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS portal_id INTEGER REFERENCES portals(id) ON DELETE CASCADE;

-- ===== ÍNDICES PARA PERFORMANCE =====
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_portal_id ON users(portal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_portal_id ON appointments(portal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);

-- =====================================================
-- DADOS INICIAIS
-- =====================================================

-- Criar portal padrão Famalicão (migração dos dados existentes)
INSERT INTO portals (name) 
VALUES ('Famalicão')
ON CONFLICT (name) DO NOTHING;

-- Criar utilizador admin master
-- Username: admin
-- Password: admin123 (DEVE SER ALTERADA após primeiro login)
-- Hash gerado com bcrypt (10 rounds)
INSERT INTO users (username, password_hash, portal_id, role)
VALUES (
  'admin',
  '$2a$10$hBamWiSSnLyVe4OJe4r7JucAbpmqAPoh/XEBCSbZ9qIdmBsn2A3pa',
  NULL,
  'admin'
)
ON CONFLICT (username) DO NOTHING;

-- Associar agendamentos existentes ao portal Famalicão
UPDATE appointments 
SET portal_id = (SELECT id FROM portals WHERE name = 'Famalicão')
WHERE portal_id IS NULL;

-- =====================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON TABLE portals IS 'Tabela de portais - cada portal representa um serviço móvel independente';
COMMENT ON COLUMN portals.name IS 'Nome único do portal (ex: Famalicão, Porto, Braga)';

COMMENT ON TABLE users IS 'Tabela de utilizadores - cada utilizador pertence a um portal (exceto admin master)';
COMMENT ON COLUMN users.username IS 'Username único no sistema';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt da password (10 rounds)';
COMMENT ON COLUMN users.portal_id IS 'ID do portal associado (NULL para admin master)';
COMMENT ON COLUMN users.role IS 'admin: acesso total | user: acesso apenas ao portal atribuído';

COMMENT ON COLUMN appointments.portal_id IS 'ID do portal - permite isolamento de dados entre serviços';

-- =====================================================
-- QUERIES ÚTEIS PARA ADMINISTRAÇÃO
-- =====================================================

-- Ver todos os portais com contagem de utilizadores
-- SELECT p.id, p.name, COUNT(u.id) as user_count
-- FROM portals p
-- LEFT JOIN users u ON p.id = u.portal_id
-- GROUP BY p.id, p.name
-- ORDER BY p.name;

-- Ver todos os utilizadores com seus portais
-- SELECT u.username, u.role, p.name as portal_name
-- FROM users u
-- LEFT JOIN portals p ON u.portal_id = p.id
-- ORDER BY u.username;

-- Ver agendamentos por portal
-- SELECT p.name, COUNT(a.id) as appointment_count
-- FROM portals p
-- LEFT JOIN appointments a ON p.id = a.portal_id
-- GROUP BY p.name
-- ORDER BY appointment_count DESC;

