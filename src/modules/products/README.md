# Módulo: Products

## Objetivo

Gerenciar o catálogo de produtos da loja: criação, listagem, busca, atualização e desativação.

## Responsabilidade Principal

Fornecer acesso ao catálogo de produtos com suporte a paginação, filtros, busca textual e cache. Operações de escrita são restritas a ADMINs. Produtos desativados somem imediatamente do catálogo público.

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

Filtros fixos: apenas produtos com `status === ACTIVE` são retornados para usuários não-autenticados e usuários com role `USER`.

Response inclui objeto `pagination`: `{ page, limit, totalItems, totalPages }`.

### Cache Redis

A listagem utiliza cache-aside com chave `products:list:{JSON.stringify(params)}` e TTL de 60 segundos. O cache deve ser **invalidado** após criação, atualização ou desativação de produto.

## Regras de Negócio

- Apenas `ADMIN` pode criar, editar e desativar produtos
- Produto desativado (`status: INACTIVE`) **some imediatamente** do catálogo público — o filtro `status === ACTIVE` é aplicado em todas as listagens públicas
- Um produto pode pertencer a **múltiplas categorias** (relação N:N)
- `sku` deve ser único no sistema
- `categoryId` (ou lista de categorias) deve referenciar categorias existentes
- Produtos não devem ser deletados fisicamente se possuem `OrderItem` associados — usar `status: INACTIVE` como soft delete
- O preço do produto pode ser alterado livremente, mas alterações não afetam pedidos já criados (o preço é snapshot em `OrderItem.price`)

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma Client |
| `config/redis` | Cache de listagem |
| `config/logger` | Logging |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Proteção de rotas de escrita |

## Módulos Relacionados

- **categories**: Produto possui relação N:N com Category
- **cart**: `cartService` consulta `productRepository` para validar existência, status e estoque
- **orders**: `orderService` valida produtos via `productRepository` no checkout

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
    → SE categoryIds informados: valida existência de cada categoria
    → productRepository.create(data)
    → invalida cache: redis.del(`products:list:*`)
  → 201 { data: product }
```

### Atualizar Produto
```
PUT /api/v1/products/:id
  → authMiddleware → verificar ADMIN
  → productController.update()
  → productService.updateProduct(id, body)
    → productRepository.findById(id) → valida existência
    → SE body.sku diferente: valida unicidade
    → productRepository.update(id, data)
    → invalida cache: redis.del(`products:list:*`)
  → 200 { data: product }
```

### Desativar Produto (soft delete via status)
```
DELETE /api/v1/products/:id
  → authMiddleware → verificar ADMIN
  → productService.deleteProduct(id)
    → SE produto tem OrderItems: productRepository.update({ status: INACTIVE })
    → SE produto não tem OrderItems: productRepository.delete(id)
    → invalida cache: redis.del(`products:list:*`)
  → 204
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `productService.js` | Lógica de negócio, validação de SKU, integração de cache |
| `productRepository.js` | Queries Prisma com filtros e paginação |

## Gaps e Débitos

- **Cache sem invalidação**: Criar ou editar produtos não limpa o cache de listagem. Dados podem ficar desatualizados por até 60 segundos.
- **Relação N:N com categorias não implementada**: O schema atual provavelmente usa `categoryId` único por produto (1:N). Precisa migrar para uma tabela `ProductCategory` (N:N).
- **Delete físico sem verificação de OrderItems**: O `DELETE` atual remove fisicamente. Se houver `OrderItem` referenciando, causará erro de FK. Implementar soft delete com `status: INACTIVE` quando há pedidos associados.
- **Sem validação de categoryId no create**: O service não verifica se as categorias informadas existem antes de criar. O erro viria do banco.
- **Sem cache individual**: Apenas a listagem é cacheada. O `GET /products/:id` sempre vai ao banco.
- **[A DEFINIR]** Campos adicionais: SKU obrigatório ou opcional, peso, dimensões para cálculo de frete.
- **[A DEFINIR]** Variações de produto (tamanho, cor) com estoque individual por variação.
- **[A DEFINIR]** Imagens de produto: URLs externas ou upload gerenciado pela API.
