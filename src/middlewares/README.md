# Módulo: Middlewares

## Objetivo

Fornecer middlewares reutilizáveis que implementam preocupações transversais (cross-cutting concerns) da aplicação.

## Responsabilidade Principal

Interceptar o ciclo request/response para realizar autenticação, validação de payload, logging HTTP e tratamento centralizado de erros, sem duplicar essa lógica nos módulos de domínio.

## Middlewares Existentes

### `authMiddleware.js` — Autenticação JWT

Valida o token JWT no header `Authorization: Bearer <token>` e popula `req.user` com os dados decodificados.

**Entrada**: `Authorization: Bearer eyJ...`
**Saída**: `req.user = { sub: userId, role: 'USER' | 'ADMIN' }`
**Erro**: `401 UNAUTHORIZED` se token ausente, inválido ou expirado

Usado em: todas as rotas protegidas dos módulos `users`, `cart`, `orders`, `payments` e nas rotas de escrita de `products` e `categories`.

### `errorHandler.js` — Tratamento Global de Erros

Middleware de erro Express (4 parâmetros: `err, req, res, next`). Captura qualquer erro propagado via `next(error)` e formata a resposta padronizada.

**Comportamento**:
- Erros `AppError` (`isOperational: true`): usa `err.statusCode`, `err.code`, `err.message`, `err.details`
- Erros genéricos: status 500, code `INTERNAL_SERVER_ERROR`
- Em `development`: inclui `stack` trace na response
- Log: `logger.error()` para >= 500, `logger.warn()` para < 500

**Response de erro**:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem legível",
    "details": {},
    "stack": "..." 
  }
}
```

### `validateRequest.js` — Validação de Payload

Executa as regras do `express-validator` definidas na rota e retorna 400 se houver violações.

**Entrada**: Array de validators aplicados antes deste middleware
**Saída**: Passa para o próximo middleware ou retorna `400 INVALID_PAYLOAD`
**Formato de erro**:
```json
{
  "error": {
    "code": "INVALID_PAYLOAD",
    "message": "Validation failed",
    "details": {
      "campo": "mensagem de erro"
    }
  }
}
```

### `httpLogger.js` — Logger HTTP (Morgan)

Middleware Morgan configurado para logar requisições HTTP no console em desenvolvimento.
Formato: `:method :url :status :res[content-length] - :response-time ms`

**Ativo apenas em**: `NODE_ENV !== 'production'`

### `requestLogger.js` — Logger Simples

Logger alternativo mais simples que loga `[timestamp] METHOD URL`.

**Observação**: Redundante com Morgan. Provavelmente um artefato de desenvolvimento que pode ser removido.

## Dependências Internas

| Módulo | Uso |
|---|---|
| `utils/token` | `authMiddleware` usa `verifyAccessToken()` |
| `utils/AppError` | `authMiddleware` e `validateRequest` lançam AppError |
| `config/logger` | `errorHandler` e `httpLogger` usam o logger Winston |

## Dependências Externas

| Pacote | Middleware | Uso |
|---|---|---|
| `jsonwebtoken` | `authMiddleware` | Verificação do JWT |
| `express-validator` | `validateRequest` | Extração de erros de validação |
| `morgan` | `httpLogger` | Logger de requisições HTTP |

## Pontos de Entrada

Os middlewares são importados e aplicados em dois contextos:

1. **Globalmente** em `src/server.js`: `helmet`, `cors`, `compression`, `httpLogger`, `errorHandler`
2. **Por rota** nos arquivos `*Routes.js`: `authMiddleware`, `validateRequest`

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `authMiddleware.js` | Segurança: autenticação de todos os endpoints protegidos |
| `errorHandler.js` | Resiliência: garante resposta padronizada para qualquer erro |
| `validateRequest.js` | Qualidade: impede dados inválidos de chegarem ao service |

## Observações Técnicas e Débitos

- **`requestLogger.js` redundante**: Duplica a funcionalidade do Morgan. Deve ser avaliado para remoção.
- **Sem middleware de autorização por role**: A verificação de `role === 'ADMIN'` está espalhada nos services e controllers. Um middleware `requireRole('ADMIN')` tornaria isso mais declarativo nas rotas.
- **Sem rate limiting**: Não existe middleware de rate limit implementado. Endpoints de autenticação estão vulneráveis a brute force.
- **Sem timeout middleware**: Requests lentos (por exemplo, query pesada no banco) não têm timeout configurado.
