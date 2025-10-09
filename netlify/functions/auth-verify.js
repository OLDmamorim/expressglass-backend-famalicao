// netlify/functions/auth-verify.js
// API de autenticação - Verificação de token JWT
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'expressglass-famalicao-secret-key-change-in-production';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Método não permitido' })
    };
  }

  try {
    // Extrair token do header Authorization
    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Token não fornecido' 
        })
      };
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // Verificar e decodificar token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Token inválido ou expirado' 
        })
      };
    }

    // Buscar dados atualizados do utilizador
    const query = `
      SELECT u.id, u.username, u.portal_id, u.role,
             p.name as portal_name
      FROM users u
      LEFT JOIN portals p ON u.portal_id = p.id
      WHERE u.id = $1
    `;
    
    const { rows } = await pool.query(query, [decoded.userId]);

    if (rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Utilizador não encontrado' 
        })
      };
    }

    const user = rows[0];

    // Preparar dados do utilizador
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
      portal: user.portal_id ? {
        id: user.portal_id,
        name: user.portal_name
      } : null
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: userData
      })
    };

  } catch (error) {
    console.error('❌ Erro ao verificar autenticação:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Erro interno do servidor' 
      })
    };
  }
};

