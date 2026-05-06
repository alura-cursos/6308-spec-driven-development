# Arquitetura do Sistema — API E-Commerce

## Visão Arquitetural

A API E-Commerce é uma aplicação REST construída em **Node.js com Express 5**, organizada em **arquitetura modular por domínio de negócio**. Cada módulo encapsula seu próprio conjunto de rotas, controladores, serviços e repositórios, seguindo o padrão de **camadas horizontais dentro de contextos verticais**.

A persistência principal é feita via **PostgreSQL 15** gerenciado pelo ORM **Prisma 7**, e dados voláteis (carrinho, sessões, cache) são armazenados em **Redis 7**. O sistema é containerizado com **Docker Compose**, que orquestra os três serviços: banco de dados, cache e aplicação.

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                          Cliente HTTP                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                         Express App                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Helmet    │  │     CORS     │  │      Compression       │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐                             │
│  │  httpLogger │  │  ErrorHandler│                             │
│  └─────────────┘  └──────────────┘                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        API Router /api/v1                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │   Auth   │ │  Users   │ │ Products │ │   Categories     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │   Cart   │ │  Orders  │ │ Payments │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
└──────────────┬────────────────────────────┬────────────────────┘
               │                            │
┌──────────────▼────────────┐  ┌────────────▼───────────────────┐
│       PostgreSQL 15        │  │           Redis 7              │
│     (via Prisma ORM)       │  │   (cart, tokens, cache)        │
└───────────────────────────┘  └────────────────────────────────┘
```

---

## Padrões Utilizados

### Arquitetura em Camadas por Módulo

Cada módulo de domínio segue a mesma estrutura interna:

```
módulo/
├── *Routes.js        → Define endpoints e aplica middlewares por rota
├── *Controller.js    → Orquestra request/response, delega ao service
├── *Service.js       → Lógica de negócio, validações, composição
└── *Repository.js    → Acesso a dados (Prisma ou Redis)
```

**Regra**: Nunca pular camadas. O Controller não acessa o banco diretamente. O Repository não contém regras de negócio.

### Error Propagation Pattern

```
Service/Repository lança AppError
       ↓
Controller captura via next(error)
       ↓
errorHandler middleware formata e responde
```

### Cache-Aside Pattern (Redis)

```javascript
const cached = await redis.get(key)
if (cached) return JSON.parse(cached)

const data = await db.find(...)
await redis.set(key, JSON.stringify(data), { EX: TTL })
return data
```

Usado em: listagem de produtos (TTL 60s) e carrinho (TTL 30 dias).

### Repository Pattern com Prisma

Os repositórios encapsulam todas as queries ao banco. Services nunca importam `prisma` diretamente (exceto nos services de payment/order que usam `$transaction`).

### Transações Atômicas

```javascript
await prisma.$transaction(async (tx) => {
  // múltiplas operações no mesmo escopo
})
```

Usado em: criação de pedido (decremento de estoque + criação de order + payment) e confirmação de pagamento.

---

## Regras Arquiteturais

1. **Autenticação via JWT** — Todo endpoint protegido passa pelo `authMiddleware` que valida o `Authorization: Bearer <token>` e popula `req.user`.
2. **Autorização por role** — Endpoints de escrita para produtos e categorias exigem `role === 'ADMIN'`. Verificação feita em rota ou service.
3. **Validação dupla** — Validators com `express-validator` validam a estrutura do payload; services validam as regras de negócio.
4. **Nenhuma query direta em controllers** — Controllers só interagem com services.
5. **Erros operacionais via AppError** — Toda falha esperada deve usar `AppError(message, statusCode, code)`. Erros inesperados caem no catch genérico do `errorHandler`.
6. **Carrinho em Redis** — O carrinho nunca persiste em banco relacional. Chave: `cart:{tenantId}:{userId}`.
7. **Snapshot de preço** — Ao criar `OrderItem`, o preço do produto é copiado e congelado. Alterações de preço futuras não afetam pedidos existentes.

---

## Convenções Técnicas

| Aspecto | Convenção |
|---|---|
| Linguagem | JavaScript (CommonJS, `.js`) |
| Módulo | `require()` / `module.exports` |
| Async | `async/await` com `try/catch` |
| Naming | camelCase para variáveis e funções |
| Arquivo | camelCase (`authService.js`, `productRepository.js`) |
| Endpoints | kebab-case em URLs (`/api/v1/cart/items`) |
| Response de sucesso | `{ data: ..., meta: { timestamp } }` |
| Response de erro | `{ error: { code, message, details } }` |
| IDs | UUID v4 (gerado pelo Prisma `@default(uuid())`) |
| Datas | ISO 8601 via `new Date().toISOString()` |
| Senhas | bcrypt com salt rounds = 10 |
| Preços | `Decimal(10,2)` no banco; Float no JSON |

---

## Separação de Responsabilidades

### `src/config/`
Inicialização de infraestrutura: conexão Prisma, cliente Redis, configuração Winston. Nenhuma lógica de negócio aqui.

### `src/middlewares/`
Middlewares globais reutilizáveis: autenticação JWT, logging HTTP, validação de payload, tratamento de erros.

### `src/utils/`
Funções utilitárias puras e classes base: `AppError`, funções de geração/verificação de tokens JWT.

### `src/modules/`
Domínios de negócio. Cada módulo é autocontido e exporta suas rotas. A única comunicação entre módulos se dá via importação direta de services/repositories (não há event bus implementado).

### `prisma/`
Schema do banco de dados. Toda alteração de schema deve ser seguida de `prisma migrate dev`.

---

## Fluxo de Comunicação entre Módulos

```
[auth] ──→ importa ──→ [users/userRepository]
[auth] ──→ armazena refresh token em ──→ [Redis]

[cart] ──→ valida produto em ──→ [products/productRepository]
[cart] ──→ persiste em ──→ [Redis]

[orders] ──→ lê carrinho de ──→ [cart/cartService]
[orders] ──→ valida produto em ──→ [products/productRepository]
[orders] ──→ cria pedido via ──→ [orders/orderRepository.$transaction]
[orders] ──→ limpa carrinho em ──→ [Redis]

[payments] ──→ atualiza order em ──→ [prisma.$transaction]
```

**Observação**: Não existe um event bus ou message queue. Os módulos se comunicam por importação direta. Isso cria acoplamento entre `orders` e `cart`, e entre `orders` e `products`.

---

## Dependências Críticas

| Dependência | Versão | Papel |
|---|---|---|
| `express` | 5.2.1 | Framework HTTP |
| `@prisma/client` | 7.1.0 | ORM PostgreSQL |
| `@prisma/adapter-pg` | 7.1.0 | Adapter de driver nativo |
| `pg` | 8.16.3 | Driver PostgreSQL |
| `redis` | 5.10.0 | Cliente Redis |
| `jsonwebtoken` | 9.0.3 | Geração/verificação JWT |
| `bcrypt` | 6.0.0 | Hash de senhas |
| `express-validator` | 7.3.1 | Validação de payload |
| `helmet` | 8.1.0 | Segurança de headers HTTP |
| `winston` | 3.19.0 | Logger estruturado |
| `compression` | 1.8.1 | Compressão gzip de responses |
| `morgan` | 1.10.1 | HTTP request logger |
| `cors` | 2.8.5 | CORS middleware |

---

## Riscos Técnicos e Acoplamentos Importantes

### Risco Crítico: Race Condition no Checkout

O estoque é validado **fora da transação** em `orderService.checkout()` e decrementado **dentro** da transação em `orderRepository.createOrderTransaction()`. Sob alta concorrência, dois usuários podem validar o mesmo estoque disponível e ambos prosseguirem para a transação, causando venda de item sem estoque.

**Mitigação necessária**: Mover toda a validação de estoque para dentro da transação, usando `SELECT ... FOR UPDATE` ou verificando `stock > 0` como condição do `UPDATE`.

### Risco Alto: Sem Rate Limiting

Não existe proteção contra brute force nos endpoints de autenticação, nem proteção contra spam nos endpoints de carrinho e pedidos.

**Mitigação necessária**: Adicionar `express-rate-limit` globalmente e com configurações mais rígidas nas rotas de auth.

### Risco Médio: Cache sem Invalidação

O cache de produtos (`products:list:*`) tem TTL de 60 segundos mas não é invalidado quando um produto é criado, editado ou desativado. Leituras podem retornar dados desatualizados por até 60 segundos.

**Mitigação necessária**: Invalidar o cache após operações de escrita nos produtos.

### Risco Médio: CORS Permissivo

`cors()` está configurado sem opções, permitindo qualquer origem. Em produção isso é um risco de segurança.

**Mitigação necessária**: `cors({ origin: process.env.CORS_ORIGINS })`.

### Acoplamento: orders → cart

`orderService` importa `cartService` diretamente. Uma mudança na interface do cartService pode quebrar o checkout silenciosamente.

### Acoplamento: orders/cart → products

Tanto `orderService` quanto `cartService` consultam `productRepository` para validar existência e estoque. Qualquer mudança no model Product afeta esses dois módulos.

### Acoplamento: Multi-tenancy parcial

Os campos `tenantId` existem nas entidades mas não há filtro automático por tenant nas queries. O isolamento entre tenants depende de chamadas explícitas, que não estão implementadas consistentemente.

---

## Diretrizes para Futuras Implementações

### 1. Novos Módulos de Domínio
Siga a estrutura: `Routes → Controller → Service → Repository`. Exporte apenas as rotas. Nunca importe diretamente entre controllers.

### 2. Comunicação entre Módulos
Prefira injetar o service como dependência ao invés de importar diretamente. Para acoplamento assíncrono, considere implementar um EventEmitter ou integrar Redis Pub/Sub.

### 3. Validações
- Validação de forma (shape) → `express-validator` no arquivo `*Validators.js`
- Validação de negócio → `*Service.js`
- Nunca misturar os dois.

### 4. Novos Endpoints
- Públicos: sem `authMiddleware`
- Autenticados: adicionar `authMiddleware` na rota
- Apenas ADMIN: adicionar verificação de role no service ou um middleware `requireRole('ADMIN')`

### 5. Cache
Qualquer endpoint de listagem com filtros pode usar cache-aside. Use a chave `{recurso}:list:{JSON.stringify(filtros)}`. Garanta que operações de escrita invalidem o cache.

### 6. Erros
Sempre use `AppError` para erros esperados. Nunca lance `Error` genérico dentro de services. Todos os erros não tratados chegam ao `errorHandler`.

### 7. Testes
Use Jest + Supertest para testes de integração. Para testes unitários de services, injete mocks nos repositórios. Nunca testar controllers isoladamente sem o contexto HTTP.

### 8. Variáveis de Ambiente
Toda nova configuração deve ler de `process.env`. Adicionar validação no startup (considerar `zod` ou `joi` para validação do schema de env vars).
