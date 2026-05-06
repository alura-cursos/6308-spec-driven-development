# Módulo: Config

## Objetivo

Centralizar a inicialização e exportação dos clientes de infraestrutura utilizados pela aplicação.

## Responsabilidade Principal

Fornecer instâncias únicas (singleton) dos clientes de banco de dados (Prisma), cache (Redis) e logger (Winston), prontos para uso em qualquer módulo da aplicação.

## Funcionalidades Existentes

### `database.js` — Cliente Prisma

Inicializa o `PrismaClient` com o adapter de PostgreSQL (`@prisma/adapter-pg`) e exporta a instância única.

```javascript
const prisma = new PrismaClient({ adapter })
module.exports = prisma
```

### `redis.js` — Cliente Redis

Inicializa o cliente Redis 5.x com as configurações de host/porta do ambiente. Executa `connect()` no startup e exporta o cliente.

```javascript
const redis = createClient({ socket: { host, port } })
await redis.connect()
module.exports = redis
```

### `logger.js` — Winston Logger

Configura o logger com:
- **Nível em desenvolvimento**: `debug` (todos os logs)
- **Nível em produção**: `warn` (apenas warnings e erros)
- **Transports**: Console (colorido) + Arquivo (`logs/error.log` e `logs/all.log`)
- **Formato**: `timestamp + level + message`

```javascript
module.exports = logger
```

## Dependências Internas

Nenhuma — este módulo é a base que outros importam.

## Dependências Externas

| Pacote | Arquivo | Uso |
|---|---|---|
| `@prisma/client` | `database.js` | ORM PostgreSQL |
| `@prisma/adapter-pg` | `database.js` | Adapter de driver nativo |
| `pg` | `database.js` | Pool de conexões PostgreSQL |
| `redis` | `redis.js` | Cliente Redis |
| `winston` | `logger.js` | Logger estruturado |

## Módulos Relacionados

Todos os módulos da aplicação importam de `config/`:
- `config/database` → repositórios e services com transações
- `config/redis` → `auth`, `products`, `cart`, `orders`
- `config/logger` → qualquer módulo que precise de log

## Pontos de Entrada

Estes módulos são importados diretamente pelos módulos de domínio. Não possuem rotas HTTP.

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `database.js` | Exporta instância Prisma — usado em todos os repositórios |
| `redis.js` | Exporta cliente Redis — usado em auth, products, cart, orders |
| `logger.js` | Exporta logger Winston — usado em toda a aplicação |

## Observações Técnicas e Débitos

- **Diretório `logs/` não criado automaticamente**: O Winston tenta escrever em `logs/error.log` e `logs/all.log`. Se o diretório não existir, pode causar erro na inicialização. O Docker ou processo de start deve criar o diretório.
- **Sem pool configurado explicitamente**: O `pg.Pool` em `database.js` pode não ter configurações de max connections, idle timeout, etc. Para produção, configurar explicitamente.
- **Sem retry no Redis**: Se o Redis não estiver disponível na inicialização, a aplicação falha sem retry. Considerar `lazyConnect: true` e retry strategy.
- **Sem health check no Prisma**: Não há verificação de conectividade com o banco no startup da aplicação (apenas no Docker healthcheck do container PostgreSQL).
