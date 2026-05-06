# Módulo: Cart

## Objetivo

Gerenciar o carrinho de compras dos usuários, mantendo estado temporário de itens selecionados antes do checkout.

## Responsabilidade Principal

Persistir e manipular o carrinho de compras de cada usuário no Redis, validando estoque em tempo real e calculando totais automaticamente a cada operação.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/cart` | GET | Obrigatória | Retorna carrinho do usuário |
| `/api/v1/cart/items` | POST | Obrigatória | Adiciona ou atualiza item no carrinho |
| `/api/v1/cart/items/:itemId` | DELETE | Obrigatória | Remove item do carrinho |

### Estrutura do Carrinho (Redis)

```json
{
  "items": [
    {
      "productId": "uuid",
      "name": "Produto X",
      "price": 99.90,
      "quantity": 2
    }
  ],
  "total": 199.80
}
```

Chave Redis: `cart:{tenantId}:{userId}` (padrão: `cart:default:{userId}`)
TTL: 30 dias (renovado a cada operação de escrita)

### Adição de Item

- Se o produto já existe no carrinho, a quantidade é **somada** (não substituída)
- Valida que o produto existe no banco e está ativo
- Valida que há estoque suficiente para a quantidade total no carrinho
- O preço é capturado do banco no momento da adição (snapshot parcial — pode mudar até o checkout)
- Total é recalculado após cada operação

### Remoção de Item

O parâmetro `:itemId` na rota é na prática o `productId`. Remove o item completo, independente da quantidade.

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/redis` | Armazenamento do carrinho |
| `config/database` | Busca de produtos para validação |
| `config/logger` | Logging |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Autenticação obrigatória |

## Dependências Externas

Nenhuma dependência externa específica.

## Módulos Relacionados

- **products**: Consultado para validar existência, estoque e capturar preço atual
- **orders**: `orderService.checkout()` lê o carrinho via `cartService.getCart()` e limpa via `redis.del()` após checkout bem-sucedido

## Pontos de Entrada

- `cartRoutes.js` — todas as rotas passam pelo `authMiddleware`
- `cartService.js` — exportado e consumido diretamente por `orderService`
- Exporta router para `/api/v1/cart`

## Fluxos Importantes

### Buscar Carrinho
```
GET /api/v1/cart
  → authMiddleware
  → cartController.getCart()
    → userId = req.user.sub
  → cartService.getCart(userId, tenantId)
    → redis.get(`cart:default:${userId}`)
    → se vazio: retorna { items: [], total: 0 }
  → 200 { data: cart }
```

### Adicionar Item
```
POST /api/v1/cart/items
  → authMiddleware
  → cartController.addItem()
  → cartService.addItem(userId, { productId, quantity }, tenantId)
    → productRepository.findById(productId) → valida existência e estoque
    → cartService.getCart() → carrega estado atual
    → se productId já existe em items: soma quantity
    → senão: insere novo item
    → recalcula total
    → redis.set(key, cart, { EX: 30 dias })
  → 200 { data: cart }
```

### Remover Item
```
DELETE /api/v1/cart/items/:itemId
  → authMiddleware
  → cartController.removeItem()
  → cartService.removeItem(userId, itemId, tenantId)
    → cartService.getCart()
    → filtra items removendo o productId === itemId
    → recalcula total
    → redis.set(key, cart)
  → 200 { data: cart }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `cartService.js` | Toda a lógica do carrinho (sem repository separado) |
| `cartController.js` | Orquestra request e delegação ao service |
| `cartRoutes.js` | Define rotas com authMiddleware |

## Observações Técnicas e Débitos

- **Sem Repository separado**: Diferente dos outros módulos, o `cartService` acessa Redis e Prisma diretamente, sem um `cartRepository.js`. Isso viola a separação de camadas estabelecida nos demais módulos.
- **itemId = productId**: O parâmetro da rota DELETE é chamado `itemId` mas na prática é o `productId`. Isso pode ser confuso para consumidores da API.
- **Preço no carrinho vs. preço no pedido**: O preço é capturado no momento de adicionar ao carrinho mas pode mudar até o checkout. O snapshot definitivo de preço ocorre em `OrderItem`, não no carrinho.
- **Race condition de estoque**: A validação de estoque no `addItem` é feita com uma leitura simples. Sob alta concorrência, dois usuários podem adicionar o último item disponível ao carrinho simultaneamente.
- **Sem coupon/desconto**: O cálculo de total é simples (soma de price * quantity). Não há suporte a cupons ou descontos no carrinho.
- **Fallback de userId via query param**: O `cartController.getCart()` tem um fallback para `req.query.userId` além de `req.user.sub`. Isso pode ser um risco de segurança se um usuário informar o ID de outro.
