# Módulo: Orders

## Objetivo

Gerenciar o processo de finalização de compra (checkout) e o ciclo de vida dos pedidos.

## Responsabilidade Principal

Converter o carrinho de um usuário em um pedido persistente, garantindo atomicidade na reserva de estoque, criação de todos os registros relacionados e limpeza do carrinho após conclusão. Controlar as transições de status do pedido conforme as regras de negócio.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/orders` | GET | Obrigatória | Lista todos os pedidos do usuário autenticado |
| `/api/v1/orders` | POST | Obrigatória | Realiza checkout do carrinho |

## Endpoints Necessários (gaps)

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/orders/:id` | GET | Obrigatória | Busca um pedido específico por ID |
| `/api/v1/orders/:id/cancel` | POST | Obrigatória | Cancela pedido (usuário ou ADMIN) |
| `/api/v1/orders/:id/status` | PATCH | ADMIN | Avança status logístico (PAID→PACKING, PACKING→SHIPPED) |
| `/api/v1/orders/:id/confirm-delivery` | POST | Obrigatória | Usuário confirma recebimento (SHIPPED→DELIVERED) |

## Ciclo de Vida do Pedido

```
PENDING → PAID → PACKING → SHIPPED → DELIVERED
    ↘ CANCELED       ↘ CANCELED
```

| Status | Descrição | Quem transiciona |
|---|---|---|
| `PENDING` | Aguardando confirmação de pagamento | Sistema (checkout) |
| `PAID` | Pagamento confirmado | Sistema (via payments) |
| `PACKING` | Em separação no estoque | ADMIN |
| `SHIPPED` | Enviado ao cliente | ADMIN |
| `DELIVERED` | Recebido pelo cliente | Usuário |
| `CANCELED` | Cancelado | Usuário ou ADMIN (apenas de PENDING ou PAID) |

## Regras de Negócio

### Checkout
- O endereço de entrega deve ser informado no payload do checkout e persistido como `OrderAddress` vinculado ao pedido
- Carrinho não pode estar vazio
- Todos os produtos devem existir, estar `ACTIVE` e ter estoque suficiente
- O preço é congelado no `OrderItem.price` no momento do checkout — alterações futuras de preço não afetam o pedido
- A transação atômica garante: decremento de estoque + criação do pedido + criação do payment

### Cancelamento
- Permitido apenas nos status `PENDING` e `PAID`
- A partir de `PACKING`, o cancelamento é **bloqueado** — retorna `AppError(422, 'ORDER_CANNOT_BE_CANCELED')`
- **Cancelamento parcial de itens é proibido** — o cancelamento é sempre do pedido inteiro
- O cancelamento restaura o estoque de todos os `OrderItem` dentro da mesma transação atômica
- O cancelamento sincroniza `Payment.status → CANCELED` e `Order.status → CANCELED`

### Transições de Status
- Apenas ADMIN pode avançar: `PAID → PACKING` e `PACKING → SHIPPED`
- Apenas o próprio usuário pode marcar: `SHIPPED → DELIVERED`
- Não existe salto de status — transições fora da sequência são rejeitadas

### Listagem
- `GET /orders` retorna todos os pedidos do usuário autenticado, sem filtro de status ou data, ordenados por `createdAt DESC`
- Não existe rota para ADMIN listar pedidos de todos os usuários

## Modelo de Dados Criado no Checkout

```
Order
├── id, userId, status (PENDING), totalValue
├── address: OrderAddress
│   └── street, number, complement?, neighborhood, city, state, zipCode, country
├── items: OrderItem[]
│   └── id, orderId, productId, quantity, price (snapshot)
└── payment: Payment
    └── id, orderId, status (AWAITING_CONFIRMATION)
```

## Dependências Internas

| Módulo | Uso |
|---|---|
| `cart/cartService` | Lê e limpa o carrinho |
| `products/productRepository` | Valida existência, estoque e status dos produtos |
| `config/database` | Acesso ao Prisma para transações |
| `config/redis` | Limpeza do carrinho pós-checkout |
| `config/logger` | Logging de eventos de pedido |
| `utils/AppError` | Erros de validação |
| `middlewares/authMiddleware` | Autenticação obrigatória |

## Módulos Relacionados

- **cart**: Fonte dos dados do pedido. O carrinho é destruído após o checkout.
- **products**: Valida e atualiza o estoque dos produtos comprados. Estoque é restaurado no cancelamento.
- **payments**: O checkout cria automaticamente um `Payment`. O módulo de payments gerencia confirmação; o cancelamento de pagamento cancela o pedido e restaura estoque.

## Pontos de Entrada

- `orderRoutes.js` — rotas protegidas por `authMiddleware`
- Exporta router para `/api/v1/orders`

## Fluxos Importantes

### Checkout
```
POST /api/v1/orders
  → authMiddleware → userId = req.user.sub
  → orderController.checkout()
  → orderService.checkout(userId, { address })
    → cartService.getCart(userId)
    → SE vazio: AppError(400, 'CART_EMPTY')
    → PARA CADA item:
      → productRepository.findById(productId)
      → SE não existe: AppError(400, 'PRODUCT_NOT_FOUND')
      → SE stock < quantity: AppError(400, 'INSUFFICIENT_STOCK')
      → SE status !== ACTIVE: AppError(400, 'PRODUCT_INACTIVE')
    → orderRepository.createOrderTransaction(userId, cartItems, address)
      → prisma.$transaction:
        → product.update(stock - quantity) para cada item
        → order.create({ userId, status: PENDING, totalValue })
        → orderAddress.create({ orderId, ...address })
        → orderItem.create para cada item com price snapshot
        → payment.create({ orderId, status: AWAITING_CONFIRMATION })
    → redis.del(`cart:${userId}`)
  → 201 { data: order }
```

### Cancelamento
```
POST /api/v1/orders/:id/cancel
  → authMiddleware
  → orderService.cancelOrder(orderId, req.user)
    → orderRepository.findById(orderId) → valida existência e ownership
    → SE order.status não é PENDING nem PAID: AppError(422, 'ORDER_CANNOT_BE_CANCELED')
    → prisma.$transaction:
      → PARA CADA orderItem: product.update(stock + quantity)
      → order.update({ status: CANCELED })
      → payment.update({ status: CANCELED })
  → 200 { data: order }
```

### Avançar Status (ADMIN)
```
PATCH /api/v1/orders/:id/status
  → authMiddleware → verificar ADMIN
  → orderService.advanceStatus(orderId, newStatus)
    → Valida transição permitida: PAID→PACKING ou PACKING→SHIPPED
    → order.update({ status: newStatus })
  → 200 { data: order }
```

### Confirmar Recebimento (Usuário)
```
POST /api/v1/orders/:id/confirm-delivery
  → authMiddleware
  → orderService.confirmDelivery(orderId, userId)
    → orderRepository.findById(orderId) → valida ownership
    → SE order.status !== SHIPPED: AppError(422, 'ORDER_NOT_SHIPPED')
    → order.update({ status: DELIVERED })
  → 200 { data: order }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `orderService.js` | Orquestra checkout, cancelamento e transições de status |
| `orderRepository.js` | Contém as transações Prisma de criação e cancelamento |

## Gaps e Débitos

- **Race condition crítica no checkout**: A validação de estoque ocorre FORA da transação. Solução: mover para dentro da transação com `SELECT ... FOR UPDATE` ou checar `stock >= quantity` como condição do `UPDATE`.
- **OrderAddress não implementado**: O modelo e a persistência do endereço de entrega precisam ser criados.
- **Cancelamento com restauração de estoque não implementado**: O fluxo atual de cancelamento não restaura estoque.
- **Endpoints de status não implementados**: Os endpoints de avanço logístico (ADMIN) e confirmação de recebimento (usuário) ainda não existem.
- **Sem `GET /orders/:id`**: Não há endpoint para detalhe de um pedido específico.
- **Evento como log**: O `order.created` é apenas um log estruturado. Não há event emitter ou webhook real.
