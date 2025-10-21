const { Client } = require('pg');
const jwt = require('jsonwebtoken');

// Chave secreta para JWT
const JWT_SECRET = process.env.JWT_SECRET || 'expressglass-famalicao-secret-key-change-in-production';

// ====== CORS ======
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Portal-Id, X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function res(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

/**
 * Obtém o portal_id do utilizador autenticado
 * Prioridade:
 * 1. Token JWT do utilizador (PRIORIDADE)
 * 2. Header X-Portal-Id (fallback para testes)
 * 3. Erro se nenhum método funcionar
 */
function getPortalId(event) {
  console.log('🔍 Tentando obter portal_id...');
  console.log('Headers:', JSON.stringify(event.headers, null, 2));
  
  // 1. PRIORIDADE: Tentar obter do token JWT
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('🔓 Token decodificado:', JSON.stringify(decoded, null, 2));
      
      if (decoded.portalId) {
        console.log(`✅ Portal ID obtido do JWT: ${decoded.portalId} (${decoded.username})`);
        return decoded.portalId;
      }
      
      // Se for admin (sem portal), retornar null para acesso global
      if (decoded.role === 'admin' && !decoded.portalId) {
        console.log(`✅ Admin detectado: ${decoded.username} (acesso global)`);
        return null; // Admin vê todos os portais
      }
      
      console.warn('⚠️ Token JWT válido mas sem portalId');
    } catch (error) {
      console.warn('⚠️ Token JWT inválido:', error.message);
      // Continua para tentar o header X-Portal-Id
    }
  } else {
    console.log('⚠️ Nenhum token JWT encontrado no header Authorization');
  }

  // 2. FALLBACK: Tentar obter do header X-Portal-Id (para testes)
  const headerPortalId = event.headers['x-portal-id'] || event.headers['X-Portal-Id'];
  if (headerPortalId) {
    const portalId = parseInt(headerPortalId, 10);
    if (!isNaN(portalId) && portalId > 0) {
      console.log(`⚠️ Portal ID obtido do header X-Portal-Id (fallback): ${portalId}`);
      return portalId;
    }
  }

  // 3. FALLBACK LEGADO: Tentar obter do header X-Tenant-Id (compatibilidade com código antigo)
  const tenantId = event.headers['x-tenant-id'] || event.headers['X-Tenant-Id'];
  if (tenantId) {
    // Mapear tenant name para portal_id
    const tenantMap = {
      'famalicao': 1,
      'braga': 2,
      'vilaverde': 3,
      'vila-verde': 3
    };
    
    const mappedPortalId = tenantMap[tenantId.toLowerCase()];
    if (mappedPortalId) {
      console.log(`⚠️ Portal ID obtido do header X-Tenant-Id (legado): ${tenantId} -> ${mappedPortalId}`);
      return mappedPortalId;
    }
  }

  // 4. ERRO: Nenhum método funcionou
  console.error('❌ Nenhum método de identificação de portal funcionou');
  throw new Error('Portal não identificado. Faça login ou forneça X-Portal-Id header.');
}

async function connectDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_FAMALICAO || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

function parseId(path) {
  const m = (path || '').match(/\/appointments\/([^\/\?]+)/i);
  return m ? m[1] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: 'OK' };
  }

  let portalId;
  let client;
  
  try {
    // Obter portal_id (do JWT ou header)
    portalId = getPortalId(event);
    
    client = await connectDB();

    const method = event.httpMethod;
    const id = parseId(event.path);
    const qs = event.queryStringParameters || {};

    // ====== GET ALL - Listar agendamentos do portal ======
    if (method === 'GET' && !id) {
      const { from, to, period, status } = qs;
      const where = [];
      const values = [];
      let i = 1;

      // Se portalId for null (admin), não filtra por portal
      if (portalId !== null) {
        where.push(`portal_id = $${i++}`);
        values.push(portalId);
      }

      if (from)   { where.push(`date >= $${i++}`); values.push(from); }
      if (to)     { where.push(`date <= $${i++}`); values.push(to); }
      if (period) { where.push(`period = $${i++}`); values.push(period); }
      if (status) { where.push(`status = $${i++}`); values.push(status); }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      
      const sql = `SELECT id, date, period, plate, car, service, locality, notes, status, portal_id, created_at, updated_at
                   FROM appointments
                   ${whereClause}
                   ORDER BY date NULLS LAST, period, id DESC`;
      
      const { rows } = await client.query(sql, values);
      console.log(`📊 Retornados ${rows.length} agendamentos (portal: ${portalId || 'todos'})`);
      return res(200, rows);
    }

    // ====== GET ONE - Obter agendamento específico ======
    if (method === 'GET' && id) {
      const where = ['id = $1'];
      const values = [id];
      
      if (portalId !== null) {
        where.push('portal_id = $2');
        values.push(portalId);
      }
      
      const { rows } = await client.query(
        `SELECT * FROM appointments WHERE ${where.join(' AND ')}`,
        values
      );
      
      if (!rows.length) return res(404, { error: 'Not found' });
      return res(200, rows[0]);
    }

    // ====== POST - Criar novo agendamento ======
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { date, period, plate, car, service, notes, status } = body;
      const locality = body.locality ?? null;

      // Validação básica
      if (!date || !period || !plate) {
        return res(400, { error: 'Campos obrigatórios: date, period, plate' });
      }

      // Determinar o portal_id a usar
      let targetPortalId = portalId;
      
      // Se for admin sem portal, requer portal_id no body
      if (portalId === null) {
        if (!body.portal_id) {
          return res(400, { error: 'Admin deve especificar portal_id' });
        }
        targetPortalId = body.portal_id;
      }

      const calibragem = body.calibragem || false;
      
      const { rows } = await client.query(
        `INSERT INTO appointments (date, period, plate, car, service, locality, notes, status, portal_id, calibragem, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) 
         RETURNING *`,
        [date, period, plate, car, service, locality, notes, status || 'pending', targetPortalId, calibragem]
      );
      
      console.log(`✅ Agendamento criado: ID ${rows[0].id} (portal: ${targetPortalId})`);
      return res(201, rows[0]);
    }

    // ====== PUT - Atualizar agendamento ======
    if (method === 'PUT' && id) {
      const body = JSON.parse(event.body || '{}');
      const allowed = ['date', 'period', 'plate', 'car', 'service', 'locality', 'notes', 'status', 'calibragem'];
      const sets = [];
      const values = [];
      let i = 1;
      
      for (const k of allowed) {
        if (k in body) {
          sets.push(`${k} = $${i++}`);
          values.push(body[k]);
        }
      }

      if (sets.length === 0) {
        return res(400, { error: 'Nenhum campo para atualizar' });
      }

      sets.push(`updated_at = NOW()`);
      values.push(id);
      
      const where = [`id = $${i++}`];
      if (portalId !== null) {
        where.push(`portal_id = $${i++}`);
        values.push(portalId);
      }
      
      const sql = `UPDATE appointments 
                   SET ${sets.join(', ')} 
                   WHERE ${where.join(' AND ')}
                   RETURNING *`;
      
      const { rows } = await client.query(sql, values);
      
      if (!rows.length) {
        return res(404, { error: 'Not found or access denied' });
      }
      
      console.log(`✅ Agendamento atualizado: ID ${id}`);
      return res(200, rows[0]);
    }

    // ====== DELETE - Eliminar agendamento ======
    if (method === 'DELETE' && id) {
      const where = ['id = $1'];
      const values = [id];
      
      if (portalId !== null) {
        where.push('portal_id = $2');
        values.push(portalId);
      }
      
      const { rowCount } = await client.query(
        `DELETE FROM appointments WHERE ${where.join(' AND ')}`,
        values
      );
      
      if (!rowCount) {
        return res(404, { error: 'Not found or access denied' });
      }
      
      console.log(`✅ Agendamento eliminado: ID ${id}`);
      return res(204, {});
    }

    return res(405, { error: 'Method Not Allowed' });
    
  } catch (e) {
    console.error('❌ Error in appointments function:', e);
    console.error('Stack trace:', e.stack);
    return res(500, { 
      error: 'Internal Server Error', 
      message: e.message,
      details: e.stack
    });
  } finally {
    if (client) {
      try { 
        await client.end(); 
      } catch (e) {
        console.error('Error closing database connection:', e);
      }
    }
  }
};

