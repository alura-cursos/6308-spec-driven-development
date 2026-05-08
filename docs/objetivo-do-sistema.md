# Objetivo do Sistema — API E-Commerce

## Propósito Principal

A API E-Commerce é um backend RESTful que fornece toda a infraestrutura de dados e regras de negócio necessárias para operar uma loja virtual. Ela expõe endpoints HTTP para que clientes (aplicações front-end, apps mobile, CLIs) possam realizar as operações centrais de e-commerce: navegação de catálogo, gestão de carrinho, finalização de pedido e confirmação de pagamento.

O sistema foi projetado como um backend headless — não possui interface visual própria — e serve como a camada de dados e negócio de uma plataforma de comércio eletrônico.

---

## Problemas que Ele Resolve

| Problema | Como o sistema resolve |
|---|---|
| Autenticação e controle de acesso | JWT com access/refresh tokens, roles USER e ADMIN |
| Gestão de catálogo de produtos | CRUD de produtos e categorias com controle de estoque |
| Carrinho de compras persistente | Armazenamento em Redis com TTL de 30 dias |
| Conflitos de estoque em compras simultâneas | Transação atômica no checkout com decremento de estoque |
| Rastreamento de pedidos | Modelo Order com ciclo de vida: PENDING → PAID → PACKING → SHIPPED → DELIVERED |
| Restauração de estoque no cancelamento | Estoque restaurado atomicamente ao cancelar pedidos PENDING ou PAID |
| Controle de pagamentos | Fluxo AWAITING_CONFIRMATION → PAID/CANCELED com idempotência |
| Dados desatualizados em catálogo | Cache Redis na listagem de produtos (TTL 60s) |
| Preço congelado no momento da compra | Snapshot de preço salvo em `OrderItem.price` |

---

## Principais Fluxos de Negócio

### Fluxo 1 — Registro e Autenticação

```
Usuário informa nome, email e senha
  → Sistema valida unicidade do email
  → Senha é hashada (bcrypt)
  → Usuário é criado com role USER
  → Tokens JWT (access 15min + refresh 7d) são retornados
  → Refresh token é armazenado no Redis
```

### Fluxo 2 — Navegação e Busca de Produtos

```
Usuário acessa catálogo (sem autenticação)
  → Filtra por categoria, busca por nome/descrição
  → Resultado paginado retornado
  → Cache Redis por 60 segundos para mesmos parâmetros
```

### Fluxo 3 — Gestão do Carrinho

```
Usuário autenticado seleciona um produto e quantidade
  → Sistema valida existência do produto e estoque disponível
  → Item é adicionado/atualizado no carrinho (Redis)
  → Total é recalculado imediatamente
  → Carrinho persiste por 30 dias
```

### Fluxo 4 — Checkout (Criação de Pedido)

```
Usuário autenticado solicita checkout (com endereço de entrega no payload)
  → Sistema carrega carrinho do Redis
  → Valida: carrinho não vazio, produtos existem, estoque suficiente, produtos ACTIVE
  → Transação atômica:
     a. Decrementa estoque de todos os produtos
     b. Cria Order com status PENDING
     c. Cria OrderItems com snapshot de preço e quantidade
     d. Cria OrderAddress com endereço de entrega
     e. Cria Payment com status AWAITING_CONFIRMATION
  → Carrinho é apagado do Redis
  → Pedido retornado ao usuário
```

### Fluxo 5 — Confirmação de Pagamento

```
Frontend envia confirmação com Idempotency-Key
  → Sistema busca Payment por ID
  → Se já confirmado (PAID), retorna o payment existente (idempotência)
  → Transação atômica:
     a. Payment.status → PAID
     b. Order.status → PAID
  → Confirmação retornada
```

### Fluxo 6 — Cancelamento

```
Usuário ou ADMIN solicita cancelamento
  → Valida: Order.status deve ser PENDING ou PAID
  → Se PACKING, SHIPPED ou DELIVERED: retorna erro (cancelamento bloqueado)
  → Transação atômica:
     a. Payment.status → CANCELED
     b. Order.status → CANCELED
     c. Restaura estoque de todos os OrderItems
  → Confirmação retornada
```

### Fluxo 7 — Avanço de Status Logístico (ADMIN)

```
ADMIN avança o status do pedido
  → PAID → PACKING: pedido entra em separação
  → PACKING → SHIPPED: pedido enviado ao cliente
  → Transições fora dessa sequência são bloqueadas
```

### Fluxo 8 — Confirmação de Recebimento (Usuário)

```
Usuário confirma que recebeu o pedido
  → Valida: Order.status deve ser SHIPPED
  → Order.status → DELIVERED
```

### Fluxo 9 — Gestão Administrativa

```
Usuário ADMIN acessa o sistema
  → Cria/edita/desativa produtos
  → Cria/edita/remove categorias (sem produtos associados)
  → Gerencia usuários (ver, editar, remover)
```

---

## Atores Envolvidos

### Usuário Anônimo
- Acessa catálogo de produtos
- Filtra e busca produtos
- Visualiza categorias
- **Não pode**: adicionar ao carrinho, fazer pedido, acessar dados pessoais

### Usuário Autenticado (role: USER)
- Tudo que o Anônimo pode
- Gerencia seu carrinho
- Realiza checkout e cria pedidos
- Visualiza seus próprios pedidos
- Confirma e cancela pagamentos
- Visualiza e edita seu próprio perfil
- **Não pode**: criar/editar produtos, ver dados de outros usuários, alterar roles

### Administrador (role: ADMIN)
- Tudo que o Usuário Autenticado pode
- Cria, edita e remove produtos
- Cria, edita e remove categorias
- Visualiza e gerencia qualquer usuário
- Altera roles de outros usuários

### Sistema Externo (Integração de Pagamentos)
- Hipótese: pode chamar `POST /payments/:id/confirm` com uma `Idempotency-Key`
- O endpoint está preparado para receber webhooks de gateways de pagamento

---

## Funcionalidades Centrais

### Autenticação e Identidade
- Registro com email e senha
- Login com retorno de tokens JWT
- Controle de acesso por role (USER, ADMIN)
- Tokens com expiração (access: 15min, refresh: 7 dias)

### Catálogo
- Listagem paginada de produtos com filtros (categoria, busca textual)
- CRUD completo de produtos (apenas ADMIN)
- Gestão de categorias com hierarquia pai-filho (apenas ADMIN)
- Cache automático de listagens

### Carrinho
- Adição, atualização e remoção de itens
- Validação de estoque em tempo real
- Persistência automática por 30 dias
- Cálculo de total atualizado em toda operação

### Pedidos
- Checkout direto do carrinho
- Snapshot de preço e quantidade no momento do pedido
- Decremento atômico de estoque
- Listagem de pedidos por usuário

### Pagamentos
- Criação de intenção de pagamento
- Confirmação com idempotência via `Idempotency-Key`
- Cancelamento de pagamento
- Sincronização automática do status do pedido

---

## Visão de Produto

O sistema está posicionado como um **backend de e-commerce genérico e extensível**, adequado para:

- Lojas virtuais de pequeno e médio porte
- Plataformas que precisam de um backend headless para múltiplos front-ends (web, mobile)
- Projetos de aprendizado e referência para desenvolvimento de APIs REST com Node.js

O suporte a `tenantId` em usuários, produtos e pedidos indica uma intenção de evolução para **multi-tenancy**, permitindo que múltiplos lojistas operem sobre a mesma infraestrutura.

A infraestrutura Docker torna o sistema facilmente deployável em ambientes de cloud (AWS ECS, GCP Cloud Run, Heroku, Railway, etc.).

---

## Contexto Operacional do Sistema

### Infraestrutura Atual

```
Docker Compose:
  ├── PostgreSQL 15 (porta 5432) — dados relacionais persistentes
  ├── Redis 7 (porta 6379) — cache, sessões e carrinho
  └── API Node.js (porta 3000) — lógica de negócio e HTTP
```

### Inicialização

Na subida do container da API, é executado automaticamente:
1. `prisma generate` — gera o cliente TypeScript
2. `prisma migrate deploy` — aplica migrações pendentes
3. `node src/server.js` — inicia o servidor

### Ambientes

| Variável | Desenvolvimento | Produção (esperado) |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| Log level | `debug` | `warn` |
| Stack trace nos erros | Sim | Não |
| `DATABASE_URL` | `postgresql://admin:admin123@postgres:5432/api_ecommerce` | Variável de ambiente segura |

### Observabilidade Atual

- **Logs HTTP**: Morgan em desenvolvimento
- **Logs de aplicação**: Winston (console + arquivo `error.log` / `all.log`)
- **Sem**: APM, tracing distribuído, métricas Prometheus, alertas

### Integrações Externas Ativas

Nenhuma integração com gateway de pagamento real está implementada. O módulo de pagamentos simula o fluxo com status internos. Uma integração futura com Stripe, PagSeguro ou Mercado Pago precisaria substituir o `paymentService.createPaymentIntent()` e tratar webhooks no `confirmPayment()`.
