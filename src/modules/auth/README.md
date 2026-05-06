# Módulo: Auth

## Objetivo

Gerenciar o ciclo de vida de identidade dos usuários: registro, autenticação e emissão de tokens JWT.

## Responsabilidade Principal

Autenticar usuários e fornecer tokens de acesso (access token) e renovação (refresh token) que habilitam o acesso autenticado aos demais módulos.

## Funcionalidades Existentes

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/v1/auth/register` | POST | Cria novo usuário e retorna tokens |
| `/api/v1/auth/login` | POST | Autentica usuário e retorna tokens |

### Registro (`register`)
- Valida unicidade de email
- Faz hash da senha com bcrypt (salt rounds: 10)
- Cria usuário com role padrão `USER`
- Gera `accessToken` (JWT, expira em `JWT_ACCESS_EXPIRATION`) e `refreshToken` (expira em `JWT_REFRESH_EXPIRATION`)
- Armazena o refreshToken no Redis com TTL de 7 dias
- Retorna `{ user, tokens }` com status 201

### Login (`login`)
- Valida existência do email no banco
- Compara senha com bcrypt
- Gera novos tokens (mesma lógica do registro)
- Retorna `{ user, tokens }` com status 200

## Dependências Internas

| Módulo | Uso |
|---|---|
| `users/userRepository` | Criar e buscar usuários no banco |
| `config/redis` | Armazenar refresh tokens |
| `config/logger` | Logging de operações |
| `utils/token` | Gerar e verificar tokens JWT |
| `utils/AppError` | Lançar erros operacionais |
| `middlewares/validateRequest` | Validar payload de entrada |

## Dependências Externas

| Pacote | Uso |
|---|---|
| `bcrypt` | Hash e comparação de senhas |
| `jsonwebtoken` | Geração e verificação de tokens JWT |
| `express-validator` | Validação de campos do request |

## Módulos Relacionados

- **users**: O registro cria um usuário via `userRepository.create()`
- **authMiddleware**: Usa `utils/token.verifyAccessToken()` para validar tokens nos demais módulos

## Pontos de Entrada

- `authRoutes.js` — registra as rotas no Express e aplica validators
- Exporta o router para ser montado em `src/server.js` sob `/api/v1/auth`

## Fluxos Importantes

### Fluxo de Registro
```
POST /api/v1/auth/register
  → validateRequest (authValidators)
  → authController.register()
  → authService.register()
    → userRepository.findByEmail() — valida email único
    → bcrypt.hash(password, 10)
    → userRepository.create()
    → generateAccessToken(userId, role)
    → generateRefreshToken(userId)
    → redis.set(`refresh:${userId}`, refreshToken, TTL: 7d)
  → 201 { data: { user, tokens } }
```

### Fluxo de Login
```
POST /api/v1/auth/login
  → validateRequest (authValidators)
  → authController.login()
  → authService.login()
    → userRepository.findByEmail()
    → bcrypt.compare(password, hash)
    → generateAccessToken()
    → generateRefreshToken()
    → redis.set(...)
  → 200 { data: { user, tokens } }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `authService.js` | Lógica central de autenticação |
| `authValidators.js` | Regras de validação de payload (express-validator) |
| `authRoutes.js` | Mapeamento de rotas e aplicação de validators |

## Observações Técnicas e Débitos

- **Sem refresh token endpoint**: Não há `POST /auth/refresh` implementado. O refreshToken é armazenado no Redis mas nunca é consumido para renovar o access token.
- **Sem logout endpoint**: Não há `POST /auth/logout` que invalide o refreshToken no Redis.
- **Validação de senha mínima**: Apenas valida `>= 6 caracteres`. Sem regras de complexidade (maiúscula, número, símbolo).
- **Role no registro**: A API aceita `role` no body do registro, o que pode permitir que um usuário se registre como ADMIN. Verificar se há bloqueio desta operação.
