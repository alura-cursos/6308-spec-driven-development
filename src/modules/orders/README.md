# Módulo: Orders

## Objetivo

Gerenciar o processo de finalização de compra (checkout) e o ciclo de vida dos pedidos.

## Responsabilidade Principal

Converter o carrinho de um usuário em um pedido persistente, garantindo atomicidade na reserva de estoque, criação de todos os registros relacionados e limpeza do carrinho após conclusão.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/orders` | GET | Obrigatória | Lista pedidos do usuário autenticado |
| `/api/v1/orders` | POST | Obrigatória | Realiza checkout do carrinho |

### Listagem de Pedidos

Retorna todos os pedidos do usuário autenticado, ordenados por `createdAt DESC`. Inclui os relacionamentos `items` e `payment` em cada pedido.

### Checkout (POST /api/v1/orders)

Operação central do módulo. Executa as seguintes etapas em sequência:

1. **Carrega** o carrinho do Redis
2. **Valida**:
   - Carrinho não está vazio
   - Cada produto existe no banco
   - Cada produto tem estoque suficiente
   - Cada produto está com status `ACTIVE`
3. **Transação atômica** (`prisma.$transaction`):
   - Decrementa `stock` de cada produto na quantidade comprada
   - Cria `Order` com `status: PENDING`
   - Cria cada `OrderItem` com snapshot de `price` e `quantity`
   - Cria `Payment` com `status: AWAITING_CONFIRMATION`
4. **Limpa** o carrinho no Redis (`redis.del(key)`)
5. **Emite** evento `order.created` via log

### Modelo de Dados Criado no Checkout

```
Order
├── id, userId, status (PENDING), totalValue, tenantId
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

## Dependências Externas

Nenhuma dependência externa específica.

## Módulos Relacionados

- **cart**: Fonte dos dados do pedido. O carrinho é destruído após o checkout.
- **products**: Valida e atualiza o estoque dos produtos comprados.
- **payments**: O checkout cria automaticamente um `Payment`. O módulo de payments gerencia o fluxo de confirmação/cancelamento.

## Pontos de Entrada

- `orderRoutes.js` — rotas protegidas por `authMiddleware`
- Exporta router para `/api/v1/orders`
- `orderService.checkout()` é o método central, chamado pelo controller

## Fluxos Importantes

### Checkout
```
POST /api/v1/orders
  → authMiddleware → userId = req.user.sub
  → orderController.checkout()
  → orderService.checkout(userId)
    → cartService.getCart(userId)
    → SE vazio: AppError(400, 'CART_EMPTY')
    → PARA CADA item:
      → productRepository.findById(productId)
      → SE não existe: AppError(400, 'PRODUCT_NOT_FOUND')
      → SE stock < quantity: AppError(400, 'INSUFFICIENT_STOCK')
      → SE status !== ACTIVE: AppError(400, 'PRODUCT_INACTIVE')
    → orderRepository.createOrderTransaction(userId, cartItems)
      → prisma.$transaction:
        → product.update(stock - quantity) para cada item
        → order.create({ userId, status: PENDING, totalValue, items })
        → payment.create({ orderId, status: AWAITING_CONFIRMATION })
    → redis.del(`cart:default:${userId}`)
    → logger.info('order.created', { orderId })
  → 201 { data: order, message: 'Order created successfully' }
```

### Listar Pedidos
```
GET /api/v1/orders
  → authMiddleware → userId = req.user.sub
  → orderController.list()
  → orderService.listOrders(userId)
    → orderRepository.findByUserId(userId)
      → WHERE userId = userId
      → include: { items: true, payment: true }
      → orderBy: { createdAt: 'desc' }
  → 200 { data: [...orders] }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `orderService.js` | Orquestra o checkout com validações pré-transação |
| `orderRepository.js` | Contém a `$transaction` de criação do pedido |

## Observações Técnicas e Débitos

- **Race condition crítica**: A validação de estoque é feita FORA da transação. Entre a validação e o `UPDATE stock`, outro request pode consumir o estoque restante. Solução: mover toda a validação de estoque para dentro da transação com `SELECT ... FOR UPDATE` ou checar `stock >= quantity` como condição do `UPDATE`.
- **Sem endpoint para detalhe do pedido**: Não há `GET /orders/:id` para buscar um pedido específico por ID.
- **Sem cancelamento pelo usuário**: Não há `POST /orders/:id/cancel` para que o usuário cancele um pedido diretamente (apenas via payments).
- **Evento como log**: O `order.created` é apenas um log estruturado. Não há event emitter, fila ou webhook real disparado.
- **totalValue calculado no service**: O totalValue é calculado somando `price * quantity` dos itens do carrinho. O preço usado é o do carrinho, que pode estar desatualizado em relação ao banco (ver débito no módulo cart).
