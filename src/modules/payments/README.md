# Módulo: Payments

## Objetivo

Gerenciar o fluxo de pagamento de pedidos: criação de intenção de pagamento, confirmação e cancelamento.

## Responsabilidade Principal

Controlar o ciclo de vida de um pagamento, garantindo atomicidade entre o status do `Payment` e do `Order`, idempotência na confirmação e aplicação correta das regras de cancelamento (incluindo bloqueio por status logístico e restauração de estoque).

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/payments` | POST | Obrigatória | Cria ou retorna intenção de pagamento para um pedido |
| `/api/v1/payments/:id/confirm` | POST | Obrigatória | Confirma o pagamento |
| `/api/v1/payments/:id/cancel` | POST | Obrigatória | Cancela o pagamento |

### Estados do Payment

```
AWAITING_CONFIRMATION → PAID
AWAITING_CONFIRMATION → CANCELED
```

O `Payment` é criado automaticamente no checkout com status `AWAITING_CONFIRMATION`. O endpoint `POST /payments` serve para buscar ou criar um payment para um pedido (idempotente por `orderId`).

### Confirmação de Pagamento (`POST /payments/:id/confirm`)

- Chamada pelo **frontend** diretamente — não é um webhook de gateway externo
- Requer o header `Idempotency-Key` obrigatoriamente
- Se o pagamento já está com status `PAID`, retorna o payment existente sem modificar (idempotência)
- Se está `AWAITING_CONFIRMATION`, executa transação atômica:
  - `Payment.status → PAID`
  - `Order.status → PAID`

### Cancelamento (`POST /payments/:id/cancel`)

- Verifica o `Order.status` antes de prosseguir:
  - `PENDING` ou `PAID`: cancelamento permitido
  - `PACKING`, `SHIPPED` ou `DELIVERED`: **retorna erro** `AppError(422, 'ORDER_CANNOT_BE_CANCELED')`
- Transação atômica quando permitido:
  - `Payment.status → CANCELED`
  - `Order.status → CANCELED`
  - Restaura `stock` de todos os `OrderItem` do pedido

## Regras de Negócio

- A confirmação é sempre iniciada pelo frontend — não há webhook de gateway no escopo atual
- Cancelamento é bloqueado se o pedido estiver em `PACKING`, `SHIPPED` ou `DELIVERED`
- Cancelamento nunca é parcial — cancela o pedido inteiro e restaura todo o estoque
- A restauração de estoque ocorre dentro da mesma transação atômica do cancelamento
- O endpoint deve validar que o `paymentId` pertence ao usuário autenticado (ownership)

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma para transações atômicas |
| `config/logger` | Logging de eventos de pagamento |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Autenticação obrigatória |

## Dependências Externas

Nenhuma integração com gateway de pagamento real. O módulo simula o fluxo com estados internos.

## Módulos Relacionados

- **orders**: O checkout cria automaticamente um `Payment`. Confirmação e cancelamento atualizam `Order.status` e, no cancelamento, restauram o estoque dos produtos.

## Pontos de Entrada

- `paymentRoutes.js` — todas as rotas protegidas por `authMiddleware`
- Exporta router para `/api/v1/payments`

## Fluxos Importantes

### Criar Intenção de Pagamento
```
POST /api/v1/payments
  → authMiddleware
  → paymentController.create()
  → paymentService.createPaymentIntent(orderId)
    → paymentRepository.findByOrderId(orderId)
    → SE encontrado: retorna payment existente
    → SE não encontrado: paymentRepository.create({ orderId, status: AWAITING_CONFIRMATION })
  → 201 { data: payment }
```

### Confirmar Pagamento (com idempotência)
```
POST /api/v1/payments/:id/confirm
  → authMiddleware
  → paymentService.confirmPayment(id, idempotencyKey)
    → SE !idempotencyKey: AppError(400, 'IDEMPOTENCY_KEY_REQUIRED')
    → paymentRepository.findById(id) → valida existência e ownership
    → SE payment.status === PAID: retorna payment (idempotência)
    → prisma.$transaction:
      → payment.update({ status: 'PAID' })
      → order.update({ status: 'PAID' })
  → 200 { data: payment }
```

### Cancelar Pagamento
```
POST /api/v1/payments/:id/cancel
  → authMiddleware
  → paymentService.cancelPayment(id, userId)
    → paymentRepository.findById(id) → valida existência e ownership
    → SE order.status em [PACKING, SHIPPED, DELIVERED]:
        AppError(422, 'ORDER_CANNOT_BE_CANCELED')
    → prisma.$transaction:
      → payment.update({ status: 'CANCELED' })
      → order.update({ status: 'CANCELED' })
      → PARA CADA orderItem: product.update(stock + quantity)
  → 200 { data: payment }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `paymentService.js` | Lógica de confirmação, idempotência, cancelamento e validação de status |
| `paymentRepository.js` | Queries Prisma para Payment |

## Gaps e Débitos

- **Restauração de estoque no cancelamento não implementada**: O fluxo atual não restaura estoque ao cancelar.
- **Validação de status antes do cancelamento não implementada**: O cancelamento atual não verifica se o pedido está em status que permite cancelar.
- **Sem validação de ownership**: O endpoint não verifica se o `paymentId` pertence ao usuário autenticado. Qualquer usuário autenticado pode confirmar ou cancelar qualquer pagamento.
- **Sem integração real com gateway**: `createPaymentIntent` não gera `clientSecret` (Stripe) nem URL de pagamento. O campo `externalId` existe no model mas não é preenchido.
- **Idempotência limitada**: O `Idempotency-Key` é recebido mas não armazenado. Requisições concorrentes que chegam antes da primeira completar não são protegidas.
- **Sem reembolso**: Não há fluxo de estorno após um pedido ser `PAID`. [A DEFINIR]
