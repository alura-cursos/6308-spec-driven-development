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

Chave Redis: `cart:{userId}`
TTL: 30 dias (renovado a cada operação de escrita)

### Adição de Item

- Se o produto já existe no carrinho, a quantidade é **somada** (não substituída)
- Valida que o produto existe no banco e está `ACTIVE`
- Valida que há estoque suficiente para a quantidade total no carrinho
- O preço é capturado do banco no momento da adição (snapshot parcial — pode mudar até o checkout)
- Total é recalculado após cada operação

### Remoção de Item

O parâmetro `:itemId` na rota é na prática o `productId`. Remove o item completo, independente da quantidade.

## Regras de Negócio

- Apenas usuários autenticados podem acessar o carrinho
- Cada usuário tem seu próprio carrinho isolado — o `userId` vem exclusivamente de `req.user.sub` (JWT), nunca de query param ou body
- Produto `INACTIVE` não pode ser adicionado ao carrinho
- O preço snapshot no carrinho é indicativo; o snapshot definitivo ocorre em `OrderItem` no checkout
- O carrinho é destruído após checkout bem-sucedido

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/redis` | Armazenamento do carrinho |
| `config/database` | Busca de produtos para validação |
| `config/logger` | Logging |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Autenticação obrigatória |

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
  → cartService.getCart(userId)
    → redis.get(`cart:${userId}`)
    → se vazio: retorna { items: [], total: 0 }
  → 200 { data: cart }
```

### Adicionar Item
```
POST /api/v1/cart/items
  → authMiddleware
  → cartController.addItem()
  → cartService.addItem(userId, { productId, quantity })
    → productRepository.findById(productId) → valida existência, status ACTIVE e estoque
    → cartService.getCart() → carrega estado atual
    → se productId já existe em items: soma quantity
    → senão: insere novo item
    → recalcula total
    → redis.set(`cart:${userId}`, cart, { EX: 30 dias })
  → 200 { data: cart }
```

### Remover Item
```
DELETE /api/v1/cart/items/:itemId
  → authMiddleware
  → cartController.removeItem()
  → cartService.removeItem(userId, itemId)
    → cartService.getCart()
    → filtra items removendo o productId === itemId
    → recalcula total
    → redis.set(`cart:${userId}`, cart)
  → 200 { data: cart }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `cartService.js` | Toda a lógica do carrinho (sem repository separado) |
| `cartController.js` | Orquestra request e delegação ao service |
| `cartRoutes.js` | Define rotas com authMiddleware |

## Gaps e Débitos

- **Sem Repository separado**: O `cartService` acessa Redis e Prisma diretamente, sem um `cartRepository.js`. Viola a separação de camadas dos demais módulos.
- **itemId = productId**: O parâmetro da rota DELETE é chamado `itemId` mas na prática é o `productId`. Pode confundir consumidores da API.
- **Race condition de estoque**: A validação de estoque no `addItem` é uma leitura simples. Sob alta concorrência, dois usuários podem adicionar o último item disponível simultaneamente.
- **Fallback inseguro de userId**: O `cartController` não deve aceitar `req.query.userId` como fallback — o `userId` deve vir exclusivamente de `req.user.sub`.
- **Sem coupon/desconto**: Cálculo de total é simples (price × quantity). Não há suporte a cupons.
