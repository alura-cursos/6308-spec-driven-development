# Módulo: Payments

## Objetivo

Gerenciar o fluxo de pagamento de pedidos: criação de intenção de pagamento, confirmação e cancelamento.

## Responsabilidade Principal

Controlar o ciclo de vida de um pagamento, garantindo atomicidade entre o status do `Payment` e do `Order`, e idempotência na confirmação para suportar reenvios seguros (ex.: webhooks de gateways).

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

- Requer o header `Idempotency-Key` obrigatoriamente
- Se o pagamento já está com status `PAID`, retorna o payment existente sem modificar (idempotência total)
- Se está `AWAITING_CONFIRMATION`, executa transação atômica:
  - `Payment.status → PAID`
  - `Order.status → PAID`
- Emite evento `order.paid` via log

### Cancelamento (`POST /payments/:id/cancel`)

- Transação atômica:
  - `Payment.status → CANCELED`
  - `Order.status → CANCELED`

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma para transações atômicas |
| `config/logger` | Logging de eventos de pagamento |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Autenticação obrigatória |

## Dependências Externas

Nenhuma dependência com gateway de pagamento real. O módulo simula o fluxo com estados internos.

## Módulos Relacionados

- **orders**: O checkout cria automaticamente um `Payment`. Confirmação e cancelamento atualizam também o `Order.status`.

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
  → cartController.confirm()
  → paymentService.confirmPayment(id, idempotencyKey)
    → SE !idempotencyKey: AppError(400, 'IDEMPOTENCY_KEY_REQUIRED')
    → paymentRepository.findById(id)
    → SE payment.status === PAID: retorna payment (idempotência)
    → prisma.$transaction:
      → payment.update({ status: 'PAID' })
      → order.update({ status: 'PAID' })
    → logger.info('order.paid', { paymentId, orderId })
  → 200 { data: payment }
```

### Cancelar Pagamento
```
POST /api/v1/payments/:id/cancel
  → authMiddleware
  → paymentController.cancel()
  → paymentService.cancelPayment(id)
    → prisma.$transaction:
      → payment.update({ status: 'CANCELED' })
      → order.update({ status: 'CANCELED' })
  → 200 { data: { message: 'Payment canceled' } }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `paymentService.js` | Lógica de confirmação com idempotência e transações |
| `paymentRepository.js` | Queries Prisma para Payment |

## Observações Técnicas e Débitos

- **Sem integração real com gateway**: `createPaymentIntent` não gera um `clientSecret` real (Stripe) nem uma URL de pagamento. O campo `externalId` existe no model mas não é preenchido. Para produção, este método precisaria chamar a API do gateway.
- **Sem webhook handler**: Não há endpoint para receber confirmações assíncronas de gateways (ex.: `POST /payments/webhook`). O `confirm` atual pressupõe que o chamador já sabe que o pagamento foi aprovado.
- **Idempotência limitada**: A idempotência atual verifica apenas o status do payment. O `Idempotency-Key` é recebido mas não é armazenado para prevenir processamento duplo em transações concorrentes que chegam simultaneamente antes da primeira completar.
- **Sem validação de ownership**: O endpoint não verifica se o `orderId` ou `paymentId` pertence ao usuário autenticado. Qualquer usuário autenticado pode confirmar/cancelar qualquer pagamento.
- **Sem reembolso**: Não há fluxo de estorno ou reembolso após um pedido ser PAID.
- **externalId não utilizado**: O campo `Payment.externalId` existe no schema mas nunca é populado na implementação atual.
