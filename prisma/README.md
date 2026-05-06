# Módulo: Prisma (Schema e Migrações)

## Objetivo

Definir a estrutura do banco de dados relacional e gerenciar migrações de schema via Prisma ORM.

## Responsabilidade Principal

Ser a fonte única de verdade (single source of truth) para o schema do banco de dados PostgreSQL. Qualquer alteração na estrutura de dados deve passar pelo `schema.prisma` e ser aplicada via migração.

## Entidades do Banco de Dados

### User
Representa um usuário do sistema (consumidor ou administrador).

| Campo | Tipo | Constraints | Descrição |
|---|---|---|---|
| `id` | String (UUID) | PK, auto-gerado | Identificador único |
| `name` | String | — | Nome completo |
| `email` | String | UNIQUE | Email de acesso |
| `password` | String | — | Senha hasheada (bcrypt) |
| `role` | Enum Role | default: USER | Nível de acesso |
| `tenantId` | String | default: "default" | Identificador de tenant |
| `createdAt` | DateTime | auto | Data de criação |
| `updatedAt` | DateTime | auto-update | Última atualização |

**Enum Role**: `USER`, `ADMIN`

**Relações**: `orders` (1-N com Order)

### Product
Representa um item do catálogo de produtos.

| Campo | Tipo | Constraints | Descrição |
|---|---|---|---|
| `id` | String (UUID) | PK | Identificador único |
| `name` | String | @index | Nome do produto |
| `description` | String | — | Descrição detalhada |
| `sku` | String | UNIQUE | Código de estoque único |
| `price` | Decimal(10,2) | — | Preço de venda |
| `stock` | Int | default: 0 | Quantidade em estoque |
| `status` | Enum ProductStatus | default: ACTIVE | Status de visibilidade |
| `tenantId` | String | default: "default" | Identificador de tenant |
| `categoryId` | String | FK | Categoria do produto |
| `createdAt` | DateTime | auto | Data de criação |
| `updatedAt` | DateTime | auto-update | Última atualização |

**Enum ProductStatus**: `ACTIVE`, `INACTIVE`

**Relações**: `category` (N-1 com Category), `orderItems` (1-N com OrderItem)

### Category
Representa uma categoria ou subcategoria de produtos.

| Campo | Tipo | Constraints | Descrição |
|---|---|---|---|
| `id` | String (UUID) | PK | Identificador único |
| `name` | String | — | Nome da categoria |
| `parentId` | String? | FK (auto-ref) | ID da categoria pai (opcional) |
| `createdAt` | DateTime | auto | Data de criação |
| `updatedAt` | DateTime | auto-update | Última atualização |

**Relações**:
- `parent` (N-1 com Category — autorreferência)
- `children` (1-N com Category — autorreferência)
- `products` (1-N com Product)

### Order
Representa um pedido finalizado pelo usuário.

| Campo | Tipo | Constraints | Descrição |
|---|---|---|---|
| `id` | String (UUID) | PK | Identificador único |
| `userId` | String | FK | Usuário que fez o pedido |
| `status` | Enum OrderStatus | default: PENDING | Estado do pedido |
| `totalValue` | Decimal(10,2) | — | Valor total do pedido |
| `tenantId` | String | default: "default" | Identificador de tenant |
| `createdAt` | DateTime | auto | Data de criação |
| `updatedAt` | DateTime | auto-update | Última atualização |

**Enum OrderStatus**: `PENDING`, `PAID`, `CANCELED`

**Relações**: `user` (N-1), `items` (1-N com OrderItem), `payment` (1-1 com Payment)

### OrderItem
Representa um produto dentro de um pedido (snapshot no momento da compra).

| Campo | Tipo | Constraints | Descrição |
|---|---|---|---|
| `id` | String (UUID) | PK | Identificador único |
| `orderId` | String | FK | Pedido pai |
| `productId` | String | FK | Produto comprado |
| `quantity` | Int | — | Quantidade comprada |
| `price` | Decimal(10,2) | — | Preço no momento da compra (snapshot) |

**Relações**: `order` (N-1), `product` (N-1)

### Payment
Representa a intenção e status de pagamento de um pedido.

| Campo | Tipo | Constraints | Descrição |
|---|---|---|---|
| `id` | String (UUID) | PK | Identificador único |
| `orderId` | String | UNIQUE, FK | Pedido associado (1-1) |
| `status` | String | default: AWAITING_CONFIRMATION | Estado do pagamento |
| `externalId` | String? | — | ID no gateway externo (não utilizado) |
| `createdAt` | DateTime | auto | Data de criação |
| `updatedAt` | DateTime | auto-update | Última atualização |

**Relação**: `order` (1-1 com Order)

## Diagrama de Relacionamentos

```
User (1) ──────────── (N) Order
                           │
                           ├── (N) OrderItem (N) ── Product (N) ── Category
                           │
                           └── (1) Payment
```

## Dependências Externas

| Pacote | Uso |
|---|---|
| `prisma` (devDep) | CLI para migrations e geração de client |
| `@prisma/client` | Client TypeScript/JavaScript gerado |
| `@prisma/adapter-pg` | Adapter de driver nativo PostgreSQL |
| `pg` | Driver PostgreSQL (Pool de conexões) |

## Comandos Importantes

```bash
# Criar nova migration após alterar o schema
npx prisma migrate dev --name nome-da-migration

# Aplicar migrations em produção
npx prisma migrate deploy

# Regenerar o client após alterar schema
npx prisma generate

# Visualizar banco de dados
npx prisma studio

# Resetar banco (CUIDADO: apaga todos os dados)
npx prisma migrate reset
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `schema.prisma` | Definição completa do banco. Qualquer alteração de schema começa aqui. |
| `prisma.config.ts` | Configuração do Prisma CLI (migrations dir, etc.) |

## Observações Técnicas e Débitos

- **Payment.status como String**: O campo `Payment.status` é do tipo `String` em vez de um Enum Prisma como os demais modelos. Os valores válidos (`AWAITING_CONFIRMATION`, `PAID`, `CANCELED`) estão implícitos no código, não no schema.
- **Sem soft delete**: Nenhuma entidade tem campo `deletedAt` para soft delete. Deleções são físicas.
- **Multi-tenancy por convenção**: Os campos `tenantId` existem mas não há filtro automático. O isolamento entre tenants depende de implementação manual em cada query.
- **Sem índices compostos**: Não há índices para queries comuns como `(userId, status)` em Orders ou `(categoryId, status)` em Products.
- **Sem Row-Level Security**: A segurança por tenant é feita na aplicação, não no banco. Um bug no código pode expor dados entre tenants.
