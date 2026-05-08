# Feature Specification: Cancelamento de Pedido

**Feature Branch**: `001-cancelamento-de-pedido`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "crie uma spec para a feature de cancelamento de pedido"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cancelamento de Pedido em PENDING (Priority: P1)

Um usuário autenticado solicita o cancelamento de um pedido que ainda aguarda confirmação de pagamento (status `PENDING`). O sistema deve cancelar o pedido inteiro, atualizar o status do pagamento associado e restaurar o estoque de todos os itens — tudo em uma única transação atômica.

**Why this priority**: Este é o cenário mais comum de cancelamento — o usuário desiste antes de confirmar o pagamento. Ele valida o caminho feliz completo da feature, incluindo a transação atômica, restauração de estoque e sincronização de payment.

**Independent Test**: Criar um pedido via `POST /api/v1/orders` (com carrinho pré-populado), não confirmar o pagamento e chamar `POST /api/v1/orders/:id/cancel`. Verificar que `Order.status === CANCELED`, `Payment.status === CANCELED` e que o estoque dos produtos foi restaurado ao valor anterior ao checkout.

**Acceptance Scenarios**:

1. **Given** um pedido com `Order.status = PENDING` pertencente ao usuário autenticado, **When** o usuário chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `200` com `{ data: { id, status: "CANCELED", ... } }`, `Payment.status` passa para `CANCELED` e o estoque de cada `OrderItem` é restaurado (`product.stock += orderItem.quantity`) na mesma transação.
2. **Given** um pedido com `Order.status = PENDING`, **When** a transação de cancelamento falha (ex: erro de banco durante atualização de estoque), **Then** nenhuma alteração é persistida — `Order.status`, `Payment.status` e estoques permanecem inalterados (rollback atômico).

---

### User Story 2 - Cancelamento de Pedido em PAID (Priority: P1)

Um usuário autenticado ou um ADMIN solicita o cancelamento de um pedido cujo pagamento já foi confirmado (status `PAID`). O sistema deve cancelar o pedido inteiro, atualizar o status do pagamento associado e restaurar o estoque de todos os itens — tudo em uma única transação atômica.

**Why this priority**: Cenário crítico para a experiência do usuário — arrependimento pós-pagamento ainda dentro da janela permitida. Compartilha a mesma transação atômica do Story 1, mas requer validação explícita de que `PAID` está na lista de status canceláveis.

**Independent Test**: Criar um pedido, confirmar o pagamento via `POST /api/v1/payments/:id/confirm` (com `Idempotency-Key`) e então chamar `POST /api/v1/orders/:id/cancel`. Verificar que `Order.status === CANCELED`, `Payment.status === CANCELED` e estoque restaurado.

**Acceptance Scenarios**:

1. **Given** um pedido com `Order.status = PAID` pertencente ao usuário autenticado, **When** o usuário chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `200` com `{ data: { id, status: "CANCELED" } }`, `Payment.status` passa para `CANCELED` e o estoque de cada `OrderItem` é restaurado.
2. **Given** um pedido com `Order.status = PAID` pertencente a qualquer usuário, **When** um ADMIN chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `200` e o cancelamento é executado com a mesma transação atômica.

---

### User Story 3 - Bloqueio de Cancelamento em SHIPPED ou DELIVERED (Priority: P1)

Um usuário ou ADMIN tenta cancelar um pedido cujo status já avançou para  `SHIPPED` ou `DELIVERED`. O sistema deve rejeitar o cancelamento com erro, sem modificar nenhum dado.

**Why this priority**: Proteção crítica para a operação logística. Sem este bloqueio, cancelamentos indevidos podem causar inconsistências no estoque e no fluxo de separação/expedição.

**Independent Test**: Criar um pedido, confirmar pagamento e avançar para `SHIPPED` via `PATCH /api/v1/orders/:id/status`. Chamar `POST /api/v1/orders/:id/cancel` e verificar que a API retorna `422` com `code: "ORDER_CANNOT_BE_CANCELED"`.

**Acceptance Scenarios**:

1. **Given** um pedido com `Order.status = PACKING`, **When** qualquer usuário chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `422` com `{ error: { code: "ORDER_CANNOT_BE_CANCELED", message: "..." } }` e nenhum dado é modificado.
2. **Given** um pedido com `Order.status = SHIPPED`, **When** qualquer usuário chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `422` com `code: "ORDER_CANNOT_BE_CANCELED"`.
3. **Given** um pedido com `Order.status = DELIVERED`, **When** qualquer usuário chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `422` com `code: "ORDER_CANNOT_BE_CANCELED"`.

---

### User Story 4 - Validação de Ownership no Cancelamento (Priority: P2)

Um usuário autenticado tenta cancelar um pedido que pertence a outro usuário. O sistema deve rejeitar a requisição com erro de autorização, sem revelar se o pedido existe.

**Why this priority**: Segurança essencial — sem ownership check, qualquer usuário autenticado pode cancelar pedidos de outros. É P2 porque o cancelamento do próprio pedido (P1) já funciona e este story protege contra abuso.

**Independent Test**: Criar dois usuários (A e B), criar um pedido com o usuário A e tentar cancelá-lo autenticado como usuário B. Verificar que a API retorna `403` ou `404`.

**Acceptance Scenarios**:

1. **Given** um pedido criado pelo usuário A com `Order.status = PENDING`, **When** o usuário B (diferente do proprietário, sem role ADMIN) chama `POST /api/v1/orders/:id/cancel`, **Then** a API retorna `403` com `{ error: { code: "FORBIDDEN" } }` e o pedido permanece inalterado.
2. **Given** um pedido criado pelo usuário A com `Order.status = PENDING`, **When** um usuário com `role: ADMIN` chama `POST /api/v1/orders/:id/cancel`, **Then** o cancelamento é executado normalmente (retorna `200`).

---

### User Story 5 - Cancelamento via Endpoint de Payments (Priority: P2)

Um usuário autenticado pode cancelar o pagamento de um pedido via `POST /api/v1/payments/:id/cancel`, que também cancela o pedido e restaura o estoque, respeitando as mesmas regras de status e ownership.

**Why this priority**: O cancelamento pode ser iniciado pelo módulo de payments além do módulo de orders. As duas rotas devem ter comportamento consistente e a lógica central deve ser a mesma.

**Independent Test**: Criar um pedido com status `PENDING`, obter o `paymentId` do response do checkout e chamar `POST /api/v1/payments/:id/cancel`. Verificar que `Payment.status === CANCELED`, `Order.status === CANCELED` e estoque restaurado.

**Acceptance Scenarios**:

1. **Given** um payment com `Payment.status = AWAITING_CONFIRMATION` cujo pedido está em `PENDING`, **When** o usuário dono chama `POST /api/v1/payments/:id/cancel`, **Then** a API retorna `200` com `{ data: { id, status: "CANCELED" } }`, `Order.status` passa para `CANCELED` e estoque restaurado.
2. **Given** um payment cujo pedido está em `PACKING`, **When** o usuário chama `POST /api/v1/payments/:id/cancel`, **Then** a API retorna `422` com `code: "ORDER_CANNOT_BE_CANCELED"`.

---

### Edge Cases

- Pedido com `Order.status = CANCELED` solicitado para cancelamento novamente: deve retornar `422` com `code: "ORDER_CANNOT_BE_CANCELED"` .
- Restauração de estoque quando um produto foi excluído ou desativado após o checkout mas antes do cancelamento: a transação deve restaurar o estoque independentemente do status do produto.
- Dois usuários tentando cancelar o mesmo pedido simultaneamente (race condition): a transação Prisma garante que apenas uma operação seja executada; a segunda deve receber erro de status já `CANCELED`.
- Pedido sem payment associado (inconsistência de dados): o cancelamento deve falhar com `500` (erro inesperado) e logar o incidente via Winston.
- Chamada a `POST /orders/:id/cancel` com `:id` de formato inválido (não-UUID): deve retornar `400` com erro de validação antes de atingir o service.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O endpoint `POST /api/v1/orders/:id/cancel` DEVE ser implementado, protegido por `authMiddleware` e acessível por usuários com `role: USER` (somente próprios pedidos) e `role: ADMIN` (qualquer pedido).
- **FR-002**: O cancelamento DEVE ser permitido apenas quando `Order.status` é `PENDING` ou `PAID`. Para qualquer outro status, o sistema DEVE lançar `AppError(422, 'ORDER_CANNOT_BE_CANCELED')`.
- **FR-003**: O cancelamento DEVE executar em uma transação atômica (`prisma.$transaction`) que inclua: `order.update({ status: CANCELED })`, `payment.update({ status: CANCELED })` e `product.update(stock + quantity)` para cada `OrderItem` do pedido.
- **FR-004**: O cancelamento é sempre do pedido inteiro — cancelamento parcial de itens é proibido.
- **FR-005**: O `orderService.cancelOrder` DEVE validar ownership: o `order.userId` deve coincidir com `req.user.sub`, a menos que `req.user.role === 'ADMIN'`.
- **FR-006**: O endpoint `POST /api/v1/payments/:id/cancel` já existente DEVE aplicar as mesmas regras de validação de status (`PENDING` ou `PAID`) e restauração de estoque, consistentes com `POST /api/v1/orders/:id/cancel`.
- **FR-007**: O comportamento esperado quando `Order.status` já é `CANCELED` e o usuário chama cancel novamente é Retornar `422` com `ORDER_CANNOT_BE_CANCELED`
- **FR-008**: O payload de response do cancelamento bem-sucedido DEVE seguir o padrão `{ data: { ...order }, meta: { timestamp } }` com status HTTP `200`.
- **FR-009**: O `orderRepository` DEVE expor um método `cancelOrderTransaction(orderId)` (ou equivalente) que encapsule a transação atômica completa — o service não deve referenciar `prisma` diretamente.

### Key Entities *(se a feature envolve dados)*

- **Order**: Representa o pedido. Atributos relevantes: `id` (UUID), `userId` (FK para User), `status` (enum: `PENDING | PAID | PACKING | SHIPPED | DELIVERED | CANCELED`), `totalValue` (Decimal). Relacionamentos: tem muitos `OrderItem`, tem um `Payment`, tem um `OrderAddress`.
- **Payment**: Representa a intenção de pagamento associada ao pedido. Atributos: `id` (UUID), `orderId` (FK para Order, unique), `status` (enum: `AWAITING_CONFIRMATION | PAID | CANCELED`). O cancelamento do pedido deve sempre sincronizar `Payment.status → CANCELED`.
- **OrderItem**: Item do pedido com snapshot de preço. Atributos: `id`, `orderId`, `productId`, `quantity`, `price` (Decimal — snapshot). Todos os itens do pedido são cancelados junto ao pedido.
- **Product**: Produto do catálogo. Atributo relevante para cancelamento: `stock` (Int). Ao cancelar, `product.stock += orderItem.quantity` para cada item.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `POST /api/v1/orders/:id/cancel` com pedido em `PENDING` retorna `200` e `Order.status === CANCELED` no banco.
- **SC-002**: `POST /api/v1/orders/:id/cancel` com pedido em `PACKING` retorna `422` com body `{ error: { code: "ORDER_CANNOT_BE_CANCELED" } }` e nenhum dado é modificado no banco.
- **SC-003**: Após cancelamento bem-sucedido de pedido em `PENDING` ou `PAID`, o estoque de cada produto referenciado em `OrderItem` é incrementado de volta ao valor pré-checkout (`product.stock = stock_antes_do_checkout`), verificável via `GET /api/v1/products/:id`.
- **SC-004**: `Payment.status === CANCELED` no banco após qualquer cancelamento bem-sucedido, verificável via query direta ao banco ou via endpoint de consulta de payment.
- **SC-005**: Usuário B sem role ADMIN recebendo `403` ao tentar cancelar pedido do usuário A.
- **SC-006**: Em caso de falha durante a transação (ex: erro simulado na atualização de estoque), nenhuma das três operações (`Order`, `Payment`, `Product`) é persistida — rollback total verificável via estado do banco antes e depois.
- **SC-007**: O cancelamento via `POST /api/v1/payments/:id/cancel` produz os mesmos efeitos colaterais no banco que o cancelamento via `POST /api/v1/orders/:id/cancel`.

## Assumptions

- O endpoint `POST /api/v1/orders/:id/cancel` ainda não existe — precisa ser criado em `orderRoutes.js`, `orderController.js` e `orderService.js`.
- O `orderRepository.js` precisa de um novo método para encapsular a transação de cancelamento com restauração de estoque (o fluxo de cancelamento atual documentado no README não restaura estoque — gap confirmado).
- O módulo `payments` já possui `POST /api/v1/payments/:id/cancel`, mas os gaps documentados indicam que a validação de status e restauração de estoque não estão implementados — esta spec cobre os dois endpoints como parte da mesma feature.
- A validação de ownership no módulo de payments também está ausente (gap documentado no payments/README.md) e deve ser implementada junto.
- Assume-se que `req.user` já está populado pelo `authMiddleware` com `{ sub: userId, role }` — sem necessidade de nova infraestrutura de autenticação.
- O campo `Order.status` aceita o valor `CANCELED` no schema Prisma atual — se o enum não incluir `CANCELED`, uma migration será necessária.
- Está fora do escopo desta spec: reembolso financeiro real (gateway externo), cancelamento parcial de itens, notificação por email ao usuário após cancelamento e estorno via Stripe/Mercado Pago.
- Está fora do escopo: criação de histórico de cancelamento ou auditoria de quem cancelou o pedido (ADMIN vs USER).
