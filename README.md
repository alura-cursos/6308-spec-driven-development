# API E-Commerce Node.js

API RESTful modular para plataforma de e-commerce, construída com **Node.js**, **Express 5**, **Prisma 7** (PostgreSQL) e **Redis 7**. Todo sistema roda em docker para mantermos consistência de ambientes. 

## Pré-requisitos

- Node.js LTS (v18+)
- Docker e Docker Compose

## Configuração

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Database
DATABASE_URL=postgresql://admin:admin123@localhost:5432/api_ecommerce

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=seu-secret-super-seguro-min-32-chars
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_SECRET=seu-secret-refresh-super-seguro
JWT_REFRESH_EXPIRATION=7d

# Application
NODE_ENV=development
PORT=3000
```

### 3. Subir Infraestrutura (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 4. Aplicar Migrações do Banco

```bash
npm run migrate
```

## Rodando a API

```bash
# Desenvolvimento (com hot-reload)
npm run dev

# Produção
node src/server.js
```

A API estará disponível em `http://localhost:3000`.

**Health check**: `GET http://localhost:3000/health`

## Estrutura do Projeto

```
.
├── docs/
│   ├── arquitetura-do-sistema.md   # Visão arquitetural completa
│   └── objetivo-do-sistema.md      # Propósito e fluxos de negócio
├── prisma/
│   ├── schema.prisma               # Definição do banco de dados
│   └── README.md                   # Documentação do schema
├── src/
│   ├── server.js                   # Ponto de entrada da aplicação
│   ├── config/
│   │   ├── database.js             # Cliente Prisma
│   │   ├── redis.js                # Cliente Redis
│   │   ├── logger.js               # Logger Winston
│   │   └── README.md
│   ├── middlewares/
│   │   ├── authMiddleware.js       # Autenticação JWT
│   │   ├── errorHandler.js         # Tratamento global de erros
│   │   ├── validateRequest.js      # Validação de payload
│   │   ├── httpLogger.js           # Logger HTTP (Morgan)
│   │   └── README.md
│   ├── utils/
│   │   ├── AppError.js             # Classe de erro padronizado
│   │   ├── token.js                # Funções JWT
│   │   └── README.md
│   └── modules/
│       ├── auth/                   # Registro e autenticação
│       │   └── README.md
│       ├── users/                  # Gestão de usuários
│       │   └── README.md
│       ├── products/               # Catálogo de produtos
│       │   └── README.md
│       ├── categories/             # Taxonomia de categorias
│       │   └── README.md
│       ├── cart/                   # Carrinho de compras (Redis)
│       │   └── README.md
│       ├── orders/                 # Checkout e pedidos
│       │   └── README.md
│       └── payments/               # Pagamentos
│           └── README.md
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Endpoints
Busque nos arquivo README.md de cada módulo para conhecer seus endpoints

## Autenticação

Endpoints protegidos requerem o header:
```
Authorization: Bearer <access_token>
```

O token é obtido ao fazer login ou registro. Expira em 15 minutos.

## Fluxo Principal (Compra Completa)

```
1. POST /auth/register         → Criar conta
2. POST /auth/login            → Obter token
3. GET  /products              → Navegar catálogo
4. POST /cart/items            → Adicionar ao carrinho
5. POST /orders                → Fazer checkout
6. POST /payments/:id/confirm  → Confirmar pagamento
```

## Arquitetura

O sistema segue arquitetura modular com separação em camadas:

```
Routes → Controller → Service → Repository → Prisma/Redis
```

Consulte [`docs/arquitetura-do-sistema.md`](docs/arquitetura-do-sistema.md) para a visão completa.

## Scripts

```bash
npm run dev          # Inicia em desenvolvimento com nodemon
npm run migrate      # Aplica migrações pendentes do banco
npm test             # Executa testes (Jest)
```

## Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | LTS (v18+) | Runtime |
| Express | 5.2.1 | Framework HTTP |
| Prisma | 7.1.0 | ORM PostgreSQL |
| PostgreSQL | 15 | Banco de dados principal |
| Redis | 7 | Cache e carrinho |
| JWT | — | Autenticação |
| bcrypt | 6.0.0 | Hash de senhas |
| Winston | 3.19.0 | Logging |
| Jest | 30.2.0 | Testes |
| Docker Compose | — | Infraestrutura local |
