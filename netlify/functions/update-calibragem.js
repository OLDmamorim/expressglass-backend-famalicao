const { Client } = require('pg');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function res(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

async function connectDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_FAMALICAO || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: 'OK' };
  }

  let client;
  
  try {
    client = await connectDB();
    console.log('✅ Conectado à base de dados');

    // Verificar appointments com CALIBRAGEM nas notes
    const checkQuery = `
      SELECT id, plate, notes, calibragem 
      FROM appointments 
      WHERE notes ILIKE '%calibragem%';
    `;
    
    const checkResult = await client.query(checkQuery);
    console.log(`📊 Encontrados ${checkResult.rows.length} appointments com "CALIBRAGEM" nas notes`);

    // Atualizar appointments
    const updateQuery = `
      UPDATE appointments 
      SET calibragem = true 
      WHERE notes ILIKE '%calibragem%' 
        AND (calibragem IS NULL OR calibragem = false)
      RETURNING id, plate, calibragem;
    `;
    
    const updateResult = await client.query(updateQuery);
    console.log(`✅ Atualizados ${updateResult.rowCount} appointments`);

    // Verificar total
    const countQuery = `SELECT COUNT(*) as total FROM appointments WHERE calibragem = true;`;
    const countResult = await client.query(countQuery);

    return res(200, {
      success: true,
      message: `Atualizados ${updateResult.rowCount} appointments`,
      found: checkResult.rows.length,
      updated: updateResult.rowCount,
      total_with_calibragem: parseInt(countResult.rows[0].total),
      updated_appointments: updateResult.rows
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return res(500, { 
      error: 'Internal Server Error', 
      details: error.message 
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

