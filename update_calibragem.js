const { Client } = require('pg');

// Usar a mesma DATABASE_URL que o backend
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_FAMALICAO;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada nas variáveis de ambiente');
  process.exit(1);
}

async function updateCalibragem() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Conectado à base de dados');

    // Verificar appointments com CALIBRAGEM nas notes
    const checkQuery = `
      SELECT id, plate, notes, calibragem 
      FROM appointments 
      WHERE notes ILIKE '%calibragem%' 
      LIMIT 10;
    `;
    
    const checkResult = await client.query(checkQuery);
    console.log(`\n📊 Encontrados ${checkResult.rows.length} appointments com "CALIBRAGEM" nas notes:`);
    checkResult.rows.forEach(row => {
      console.log(`  - ID ${row.id}: ${row.plate} | calibragem=${row.calibragem} | notes="${row.notes}"`);
    });

    // Atualizar appointments
    const updateQuery = `
      UPDATE appointments 
      SET calibragem = true 
      WHERE notes ILIKE '%calibragem%' 
        AND (calibragem IS NULL OR calibragem = false)
      RETURNING id, plate, calibragem;
    `;
    
    const updateResult = await client.query(updateQuery);
    console.log(`\n✅ Atualizados ${updateResult.rowCount} appointments para calibragem=true`);
    
    if (updateResult.rows.length > 0) {
      console.log('\nAppointments atualizados:');
      updateResult.rows.forEach(row => {
        console.log(`  - ID ${row.id}: ${row.plate} | calibragem=${row.calibragem}`);
      });
    }

    // Verificar total
    const countQuery = `SELECT COUNT(*) as total FROM appointments WHERE calibragem = true;`;
    const countResult = await client.query(countQuery);
    console.log(`\n📈 Total de appointments com calibragem=true: ${countResult.rows[0].total}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n✅ Conexão fechada');
  }
}

updateCalibragem();

