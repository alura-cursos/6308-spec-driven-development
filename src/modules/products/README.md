# Módulo: Products

## Objetivo

Gerenciar o catálogo de produtos da loja: criação, listagem, busca, atualização e remoção.

## Responsabilidade Principal

Fornecer acesso ao catálogo de produtos com suporte a paginação, filtros, busca textual e cache. Operações de escrita são restritas a ADMINs.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/products` | GET | Não | Lista produtos com paginação e filtros |
| `/api/v1/products/:id` | GET | Não | Busca produto por ID |
| `/api/v1/products` | POST | ADMIN | Cria produto |
| `/api/v1/products/:id` | PUT | ADMIN | Atualiza produto |
| `/api/v1/products/:id` | DELETE | ADMIN | Remove produto |

### Listagem de Produtos (`GET /api/v1/products`)

Query params suportados:

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `page` | number | Página atual (padrão: 1) |
| `limit` | number | Itens por página (padrão: 20) |
| `categoryId` | string | Filtrar por categoria |
| `search` | string | Busca por nome ou descrição (case-insensitive) |

Filtros fixos: apenas produtos com `status === ACTIVE` são retornados.

Response inclui objeto `pagination`: `{ page, limit, totalItems, totalPages }`.

### Cache Redis

A listagem utiliza cache-aside com chave `products:list:{JSON.stringify(params)}` e TTL de 60 segundos.

**Débito**: O cache não é invalidado quando produtos são criados ou editados.

### Criação/Atualização

- `sku` deve ser único no sistema (validação no service)
- `categoryId` deve referenciar uma categoria existente
- `status` padrão é `ACTIVE`

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma Client |
| `config/redis` | Cache de listagem |
| `config/logger` | Logging |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Proteção de rotas de escrita |

## Dependências Externas

Nenhuma dependência externa específica deste módulo.

## Módulos Relacionados

- **categories**: Produto referencia `categoryId` de Category
- **cart**: `cartService` consulta `productRepository` para validar estoque
- **orders**: `orderService` valida produtos e preços via `productRepository`

## Pontos de Entrada

- `productRoutes.js` — rotas públicas sem auth e rotas ADMIN com auth
- Exporta router para `/api/v1/products`

## Fluxos Importantes

### Listar Produtos (com cache)
```
GET /api/v1/products?page=1&limit=20&search=tênis
  → productController.list()
  → productService.listProducts({ page, limit, categoryId, search })
    → cacheKey = `products:list:${JSON.stringify(params)}`
    → redis.get(cacheKey) → se hit, retorna
    → productRepository.findAll({ filters, skip, take })
      → WHERE status=ACTIVE AND (categoryId?) AND (name OR description LIKE search)
      → ORDER BY createdAt DESC
    → redis.set(cacheKey, data, { EX: 60 })
  → 200 { data, pagination }
```

### Criar Produto
```
POST /api/v1/products
  → authMiddleware → verificar ADMIN
  → productController.create()
  → productService.createProduct(body)
    → productRepository.findBySku(sku) → se existe, AppError(409, CONFLICT)
    → productRepository.create(data)
  → 201 { data: product }
```

### Atualizar Produto
```
PUT /api/v1/products/:id
  → authMiddleware → verificar ADMIN
  → productController.update()
  → productService.updateProduct(id, body)
    → productRepository.findById(id) → valida existência
    → se body.sku e sku diferente: validar unicidade
    → productRepository.update(id, data)
  → 200 { data: product }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `productService.js` | Lógica de negócio, validação de SKU, integração de cache |
| `productRepository.js` | Queries Prisma com filtros e paginação |

## Observações Técnicas e Débitos

- **Cache sem invalidação**: Criar ou editar produtos não limpa o cache de listagem. Dados podem ficar desatualizados por até 60 segundos.
- **Soft delete ausente**: `DELETE` remove o produto fisicamente. Se houver `OrderItem` referenciando, haverá erro de FK (P2003). Considerar `status = INACTIVE` como soft delete.
- **Sem validação de categoryId**: O service não verifica se o `categoryId` informado existe antes de criar o produto. O erro viria do banco como P2025.
- **Sem cache individual**: Apenas a listagem é cacheada. O `GET /products/:id` sempre vai ao banco.
