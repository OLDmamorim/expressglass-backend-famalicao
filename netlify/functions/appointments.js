const { Client } = require('pg');

// ====== CORS ======
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function res(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

function getTenant(event) {
  const hdr = event.headers['x-tenant-id'] || event.headers['X-Tenant-Id'];
  const byHost = (event.headers.host || '').split('.')[0];
  const t = (hdr || byHost || 'default').toLowerCase().trim();
  return t.replace(/[^a-z0-9\-\._]/g, '');
}

async function connectDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
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

  const tenant = getTenant(event);
  let client;
  try {
    client = await connectDB();

    const method = event.httpMethod;
    const id = parseId(event.path);
    const qs = event.queryStringParameters || {};

    if (method === 'GET' && !id) {
      const { from, to, period, status } = qs;
      const where = ['tenant = $1'];
      const values = [tenant];
      let i = 2;

      if (from)   { where.push(`date >= $${i++}`); values.push(from); }
      if (to)     { where.push(`date <= $${i++}`); values.push(to); }
      if (period) { where.push(`period = $${i++}`); values.push(period); }
      if (status) { where.push(`status = $${i++}`); values.push(status); }

      const sql = `SELECT id, date, period, plate, car, service, locality, notes, status, created_at, updated_at
                   FROM appointments
                   WHERE ${where.join(' AND ')}
                   ORDER BY date NULLS LAST, period, id DESC`;
      const { rows } = await client.query(sql, values);
      return res(200, rows);
    }

    if (method === 'GET' && id) {
      const { rows } = await client.query(
        `SELECT * FROM appointments WHERE id = $1 AND tenant = $2`,
        [id, tenant]
      );
      if (!rows.length) return res(404, { error: 'Not found' });
      return res(200, rows[0]);
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { date, period, plate, car, service, notes, status } = body;
      const locality = body.locality ?? null; // ignorado para Famalicão

      const { rows } = await client.query(
        `INSERT INTO appointments (date, period, plate, car, service, locality, notes, status, tenant, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *`,
        [date, period, plate, car, service, locality, notes, status, tenant]
      );
      return res(201, rows[0]);
    }

    if (method === 'PUT' && id) {
      const body = JSON.parse(event.body || '{}');
      const allowed = ['date','period','plate','car','service','locality','notes','status'];
      const sets = [];
      const values = [];
      let i = 1;
      for (const k of allowed) {
        if (k in body) {
          sets.push(`${k} = $${i++}`);
          values.push(body[k]);
        }
      }
      sets.push(`updated_at = NOW()`);
      values.push(id, tenant);
      const sql = `UPDATE appointments SET ${sets.join(', ')} WHERE id = $${i++} AND tenant = $${i} RETURNING *`;
      const { rows } = await client.query(sql, values);
      if (!rows.length) return res(404, { error: 'Not found' });
      return res(200, rows[0]);
    }

    if (method === 'DELETE' && id) {
      const { rowCount } = await client.query(
        `DELETE FROM appointments WHERE id = $1 AND tenant = $2`,
        [id, tenant]
      );
      if (!rowCount) return res(404, { error: 'Not found' });
      return res(204, {});
    }

    return res(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error(e);
    return res(500, { error: 'Internal Server Error', details: String(e) });
  } finally {
    if (client) try { await client.end(); } catch {}
  }
};