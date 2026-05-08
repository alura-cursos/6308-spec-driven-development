# Regras de Negócio — API E-Commerce

Documento gerado a partir de entrevista de levantamento de requisitos. Itens marcados com **[A DEFINIR]** foram identificados como gaps e precisam de resposta antes da implementação.

---

## Ciclo de Vida do Pedido

### Status e Transições

```
PENDING → PAID → PACKING → SHIPPED → DELIVERED
    ↘ CANCELED       ↘ CANCELED
```

| Status | Descrição |
|---|---|
| `PENDING` | Pedido criado, aguardando confirmação de pagamento |
| `PAID` | Pagamento confirmado |
| `PACKING` | Em separação no estoque |
| `SHIPPED` | Enviado ao cliente |
| `DELIVERED` | Recebido pelo cliente |
| `CANCELED` | Cancelado |

### Quem Transiciona Cada Status

| Transição | Responsável |
|---|---|
| `PENDING → PAID` | Sistema (via confirmação de pagamento pelo frontend) |
| `PAID → PACKING` | ADMIN |
| `PACKING → SHIPPED` | ADMIN |
| `SHIPPED → DELIVERED` | Usuário (confirma recebimento) |
| `PENDING → CANCELED` | Usuário ou ADMIN |
| `PAID → CANCELED` | Usuário ou ADMIN |
| `PACKING → CANCELED` | **Bloqueado** |
| `SHIPPED → CANCELED` | **Bloqueado** |
| `DELIVERED → CANCELED` | **Bloqueado** |

Não existe salto de status — as transições devem respeitar a sequência acima.

---

## Cancelamento de Pedido

- Cancelamento é permitido apenas nos status `PENDING` e `PAID`.
- A partir de `PACKING`, o cancelamento é **bloqueado** e deve retornar erro.
- **Cancelamento parcial de itens é proibido** — o cancelamento é sempre do pedido inteiro.
- O cancelamento deve ocorrer em transação atômica: `Payment.status → CANCELED` + `Order.status → CANCELED`.

---

## Restauração de Estoque

- Ao cancelar um pedido com status `PENDING` ou `PAID`, o estoque de todos os itens do pedido **deve ser restaurado**.
- Se o pedido está em `PACKING`, `SHIPPED` ou `DELIVERED`, **o estoque não é restaurado**.
- A restauração de estoque deve ocorrer dentro da mesma transação atômica do cancelamento.

---

## Pagamentos

- A confirmação de pagamento é disparada pelo **frontend** via `POST /payments/:id/confirm`.
- Não há integração com gateway de pagamento externo no escopo atual — o fluxo é simulado internamente.
- O endpoint de confirmação implementa **idempotência** via `Idempotency-Key`: se o pagamento já está `PAID`, retorna o payment existente sem reprocessar.
- **[A DEFINIR]** Gateway de pagamento externo para integração futura (Stripe, Mercado Pago, PagSeguro).
- **[A DEFINIR]** Suporte a múltiplos métodos de pagamento (cartão, boleto, Pix).

---

## Catálogo — Produtos

- Produto pertence a **uma ou mais categorias** (relação N:N entre Product e Category).
- Produto desativado (`status: INACTIVE`) **some imediatamente** do catálogo público — não há período de transição.
- Apenas usuários `ADMIN` podem criar, editar e desativar produtos.
- O preço do produto é **congelado no momento do pedido** — alterações futuras de preço não afetam pedidos existentes (`OrderItem.price`).
- **[A DEFINIR]** Campos adicionais: SKU, código de barras, peso, dimensões.
- **[A DEFINIR]** Variações de produto (ex: tamanho, cor) com estoque individual por variação.
- **[A DEFINIR]** Imagens de produto: URLs externas ou upload gerenciado pela API.

---

## Catálogo — Categorias

- Hierarquia pai-filho com **profundidade ilimitada** (árvore de N níveis).
- Apenas `ADMIN` pode criar, editar e remover categorias.
- Categoria só pode ser removida se **não tiver produtos associados**.
- **[A DEFINIR]** Comportamento ao desativar uma categoria pai — as subcategorias são afetadas?

---

## Carrinho

- Carrinho persistido no Redis com TTL de 30 dias.
- Chave do carrinho: `cart:{userId}` (sem tenantId — multi-tenancy removido do escopo).
- Estoque é validado no momento de adicionar item ao carrinho.
- Total é recalculado a cada operação no carrinho.
- O carrinho é **apagado do Redis** após a criação bem-sucedida do pedido no checkout.

---

## Endereço de Entrega

- Todo pedido deve ter um **endereço de entrega** associado, informado no momento do checkout.
- O endereço é uma entidade relacionada ao `Order` (relação 1:1 com o pedido, não com o usuário).
- **[A DEFINIR]** Campos exatos: rua, número, complemento, bairro, cidade, estado, CEP e país (ou loja restrita ao Brasil?).
- **[A DEFINIR]** O usuário informa o endereço diretamente no payload do checkout, ou existe um cadastro de endereços no perfil do usuário para escolher no checkout?

---

## Usuários e Autenticação

### Roles

| Role | Permissões |
|---|---|
| `USER` | Gerenciar próprio carrinho, pedidos, perfil e senha |
| `ADMIN` | Tudo de USER + gerenciar produtos, categorias e usuários |

### Conta

- Usuário **não pode deletar a própria conta** — somente `ADMIN` pode deletar contas.
- Usuário autenticado **pode alterar a própria senha** via endpoint dedicado.
- **[A DEFINIR]** Fluxo de recuperação de senha ("esqueci minha senha") com envio de email.

### Tokens

- Access token: expira em 15 minutos.
- Refresh token: expira em 7 dias, armazenado no Redis.

---

## Listagem de Pedidos

- `GET /orders` retorna **todos os pedidos do usuário autenticado**, sem filtro de status ou data.
- Não existe rota para o `ADMIN` visualizar pedidos de todos os usuários (fora do escopo atual).

---

## Multi-tenancy

- **Fora do escopo.** O sistema opera como uma única loja com todos os produtos e clientes compartilhados.
- O campo `tenantId` deve ser **removido** de todas as entidades (`User`, `Product`, `Order`, etc.).
- Filtros por `tenantId` em queries devem ser removidos.
