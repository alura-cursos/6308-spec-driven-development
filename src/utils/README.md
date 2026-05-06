# Módulo: Utils

## Objetivo

Fornecer utilitários reutilizáveis e classes base utilizadas em toda a aplicação.

## Responsabilidade Principal

Centralizar lógica auxiliar que não pertence a nenhum domínio específico: classe de erro padronizado e funções de geração/verificação de tokens JWT.

## Utilitários Existentes

### `AppError.js` — Classe de Erro Operacional

Classe que estende `Error` para representar erros esperados e controlados da aplicação (erros operacionais), diferenciando-os de erros inesperados de sistema.

```javascript
class AppError extends Error {
  constructor(message, statusCode, code, details)
}
```

| Propriedade | Tipo | Descrição |
|---|---|---|
| `message` | string | Mensagem legível pelo usuário |
| `statusCode` | number | HTTP status code (400, 401, 403, 404, 409, etc.) |
| `code` | string | Código de erro para o cliente (ex: `UNAUTHORIZED`, `CONFLICT`) |
| `details` | object | Informações adicionais (ex: campos com erro) |
| `isOperational` | boolean | Sempre `true` — identifica erros tratados |

**Uso**:
```javascript
throw new AppError('Email já cadastrado', 409, 'CONFLICT')
throw new AppError('Não autorizado', 401, 'UNAUTHORIZED')
throw new AppError('Payload inválido', 400, 'INVALID_PAYLOAD', { campo: 'erro' })
```

O `errorHandler` middleware usa `isOperational` para distinguir AppErrors de erros inesperados.

### `token.js` — Funções JWT

Funções puras para geração e verificação de tokens JWT.

| Função | Parâmetros | Retorno | Descrição |
|---|---|---|---|
| `generateAccessToken(userId, role)` | string, string | string | JWT com payload `{ sub: userId, role }`, expira em `JWT_ACCESS_EXPIRATION` |
| `generateRefreshToken(userId)` | string | string | JWT com payload `{ sub: userId }`, expira em `JWT_REFRESH_EXPIRATION` |
| `verifyAccessToken(token)` | string | object | Decodifica e valida o access token |
| `verifyRefreshToken(token)` | string | object | Decodifica e valida o refresh token |

Lê secrets e expirations de `process.env`:
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRATION`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRATION`

## Dependências Internas

Nenhuma — estes utilitários são folhas na árvore de dependências.

## Dependências Externas

| Pacote | Arquivo | Uso |
|---|---|---|
| `jsonwebtoken` | `token.js` | `jwt.sign()` e `jwt.verify()` |

## Módulos Relacionados

- **auth**: Usa `generateAccessToken()` e `generateRefreshToken()` ao registrar/logar
- **middlewares/authMiddleware**: Usa `verifyAccessToken()` para validar tokens nas requisições

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `AppError.js` | Base de toda a gestão de erros da aplicação |
| `token.js` | Centraliza toda a lógica de JWT |

## Observações Técnicas e Débitos

- **Sem validação de env vars**: `token.js` lê `process.env.JWT_ACCESS_SECRET` diretamente. Se a variável não estiver definida, o JWT será assinado com `undefined`, tornando todos os tokens inválidos silenciosamente.
- **Sem classe diferente por tipo de erro**: Todos os erros usam a mesma `AppError`. Poderia ter subclasses como `ValidationError`, `NotFoundError`, `UnauthorizedError` para melhor rastreabilidade.
- **Sem blacklist de tokens**: `verifyAccessToken()` apenas verifica a assinatura e expiração. Não há mecanismo para invalidar um token antes do seu vencimento (ex.: após logout).
