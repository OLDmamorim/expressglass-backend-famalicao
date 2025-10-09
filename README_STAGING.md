# Backend Staging - Sistema Multi-Tenant

## 🚀 Novidades nesta Branch

Esta branch `staging` implementa o sistema de autenticação multi-tenant para o Expressglass Famalicão.

### Novas Funções API

- `auth-login.js` - Login de utilizadores (POST)
- `auth-verify.js` - Verificação de token JWT (GET)
- `portals.js` - CRUD de portais (GET, POST, PUT, DELETE)
- `users.js` - CRUD de utilizadores (GET, POST, PUT, DELETE)

### Configuração Necessária

#### 1. Variáveis de Ambiente no Netlify

Adicionar no dashboard do Netlify:

```
JWT_SECRET=expressglass-famalicao-secret-key-ALTERAR-EM-PRODUCAO
```

#### 2. Executar Schema SQL

Antes de usar o sistema, executar o schema na base de dados:

```bash
psql $DATABASE_URL < database-schema-multitenant.sql
```

Isto irá:
- Criar tabelas `portals` e `users`
- Adicionar coluna `portal_id` à tabela `appointments`
- Criar índices para performance
- Criar portal padrão "Famalicão"
- Criar utilizador admin (username: `admin`, password: `admin123`)

#### 3. Instalar Dependências

```bash
npm install
```

Novas dependências:
- `bcryptjs` - Hash de passwords
- `jsonwebtoken` - Autenticação JWT

### Credenciais Iniciais

**Admin Master:**
- Username: `admin`
- Password: `admin123`

⚠️ **IMPORTANTE:** Alterar a password após primeiro login!

### Endpoints da API

#### Autenticação
- `POST /.netlify/functions/auth-login` - Login
- `GET /.netlify/functions/auth-verify` - Verificar token

#### Portais (Admin apenas)
- `GET /.netlify/functions/portals` - Listar portais
- `POST /.netlify/functions/portals` - Criar portal
- `PUT /.netlify/functions/portals/:id` - Atualizar portal
- `DELETE /.netlify/functions/portals/:id` - Eliminar portal

#### Utilizadores (Admin apenas)
- `GET /.netlify/functions/users` - Listar utilizadores
- `POST /.netlify/functions/users` - Criar utilizador
- `PUT /.netlify/functions/users/:id` - Atualizar utilizador
- `DELETE /.netlify/functions/users/:id` - Eliminar utilizador

### Testes

```bash
# Desenvolvimento local
npm run dev

# Testar login
curl -X POST http://localhost:8888/.netlify/functions/auth-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Deploy

Esta branch será automaticamente deployada no Netlify quando fizer push.

---

**Desenvolvido para Expressglass Famalicão** 🚗💎

