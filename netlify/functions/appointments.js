const { Client } = require('pg');

// ====== CORS ======
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Portal-Id',
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
 * Obtém o portal_id a partir dos headers ou do utilizador autenticado
 * Prioridade:
 * 1. Header X-Portal-Id (para testes e compatibilidade)
 * 2. Token JWT do utilizador (quando autenticação estiver ativa)
 * 3. Default: 1 (Famalicão)
 */
function getPortalId(event) {
  // Tentar obter do header X-Portal-Id
  const headerPortalId = event.headers['x-portal-id'] || event.headers['X-Portal-Id'];
  if (headerPortalId) {
    const portalId = parseInt(headerPortalId, 10);
    if (!isNaN(portalId) && portalId > 0) {
      return portalId;
    }
  }

  // TODO: Quando autenticação estiver ativa, obter do token JWT
  // const authHeader = event.headers.authorization || event.headers.Authorization;
  // if (authHeader && authHeader.startsWith('Bearer ')) {
  //   const token = authHeader.substring(7);
  //   const decoded = jwt.verify(token, process.env.JWT_SECRET);
  //   if (decoded.portal_id) {
  //     return decoded.portal_id;
  //   }
  // }

  // Default: Portal Famalicão (id = 1)
  return 1;
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

  const portalId = getPortalId(event);
  let client;
  
  try {
    client = await connectDB();

    const method = event.httpMethod;
    const id = parseId(event.path);
    const qs = event.queryStringParameters || {};

    // ====== GET ALL - Listar agendamentos do portal ======
    if (method === 'GET' && !id) {
      const { from, to, period, status } = qs;
      const where = ['portal_id = $1'];
      const values = [portalId];
      let i = 2;

      if (from)   { where.push(`date >= $${i++}`); values.push(from); }
      if (to)     { where.push(`date <= $${i++}`); values.push(to); }
      if (period) { where.push(`period = $${i++}`); values.push(period); }
      if (status) { where.push(`status = $${i++}`); values.push(status); }

      const sql = `SELECT id, date, period, plate, car, service, locality, notes, status, portal_id, created_at, updated_at
                   FROM appointments
                   WHERE ${where.join(' AND ')}
                   ORDER BY date NULLS LAST, period, id DESC`;
      
      const { rows } = await client.query(sql, values);
      return res(200, rows);
    }

    // ====== GET ONE - Obter agendamento específico ======
    if (method === 'GET' && id) {
      const { rows } = await client.query(
        `SELECT * FROM appointments WHERE id = $1 AND portal_id = $2`,
        [id, portalId]
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

      const { rows } = await client.query(
        `INSERT INTO appointments (date, period, plate, car, service, locality, notes, status, portal_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) 
         RETURNING *`,
        [date, period, plate, car, service, locality, notes, status || 'pending', portalId]
      );
      
      return res(201, rows[0]);
    }

    // ====== PUT - Atualizar agendamento ======
    if (method === 'PUT' && id) {
      const body = JSON.parse(event.body || '{}');
      const allowed = ['date', 'period', 'plate', 'car', 'service', 'locality', 'notes', 'status'];
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
      values.push(id, portalId);
      
      const sql = `UPDATE appointments 
                   SET ${sets.join(', ')} 
                   WHERE id = $${i++} AND portal_id = $${i} 
                   RETURNING *`;
      
      const { rows } = await client.query(sql, values);
      
      if (!rows.length) {
        return res(404, { error: 'Not found or access denied' });
      }
      
      return res(200, rows[0]);
    }

    // ====== DELETE - Eliminar agendamento ======
    if (method === 'DELETE' && id) {
      const { rowCount } = await client.query(
        `DELETE FROM appointments WHERE id = $1 AND portal_id = $2`,
        [id, portalId]
      );
      
      if (!rowCount) {
        return res(404, { error: 'Not found or access denied' });
      }
      
      return res(204, {});
    }

    return res(405, { error: 'Method Not Allowed' });
    
  } catch (e) {
    console.error('Error in appointments function:', e);
    return res(500, { 
      error: 'Internal Server Error', 
      details: process.env.NODE_ENV === 'development' ? String(e) : undefined 
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

