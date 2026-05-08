# Módulo: Users

## Objetivo

Gerenciar o perfil de usuários: leitura, atualização, troca de senha e remoção de contas.

## Responsabilidade Principal

Fornecer operações CRUD sobre entidades de usuário, com regras de autorização que garantem que usuários só acessem e modifiquem seus próprios dados, enquanto ADMINs têm acesso irrestrito. Somente ADMINs podem remover contas.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/users/:id` | GET | Obrigatória | Busca perfil de usuário |
| `/api/v1/users/:id` | PUT | Obrigatória | Atualiza dados do usuário |
| `/api/v1/users/:id` | DELETE | ADMIN | Remove usuário |

## Endpoints Necessários (gaps)

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/users/me/password` | PATCH | Obrigatória | Usuário altera a própria senha |

### Regras de Autorização

| Operação | Usuário comum | ADMIN |
|---|---|---|
| `GET /users/:id` | Apenas próprio perfil | Qualquer usuário |
| `PUT /users/:id` | Apenas próprio perfil, sem alterar `role` | Qualquer usuário, pode alterar `role` |
| `DELETE /users/:id` | **Proibido** | Qualquer usuário |
| `PATCH /users/me/password` | Própria senha | Própria senha |

### Campos Retornados

A senha (`password`) é sempre removida do response antes de retornar ao cliente.

## Regras de Negócio

- **Usuário não pode deletar a própria conta** — `DELETE /users/:id` é exclusivo para `ADMIN`
- Usuário autenticado pode **alterar a própria senha** sem precisar de intervenção de ADMIN
- Troca de senha requer a senha atual para confirmação antes de aceitar a nova
- Usuário comum **não pode alterar o próprio `role`** — tentativa deve retornar `AppError(403)`
- O campo `password` nunca é retornado em nenhum response
- Atualização de email deve validar unicidade (resposta amigável, não erro de banco)

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma Client |
| `utils/AppError` | Lançar erros de autorização e not found |
| `middlewares/authMiddleware` | Proteção de todas as rotas |

## Dependências Externas

| Pacote | Uso |
|---|---|
| `bcrypt` | Hash da nova senha e comparação da senha atual na troca |

## Módulos Relacionados

- **auth**: Cria usuários via `userRepository.create()` durante o registro
- **orders**: Pedidos são vinculados ao `userId`

## Pontos de Entrada

- `userRoutes.js` — registra as rotas com `authMiddleware` aplicado a todas elas
- Exporta o router para ser montado em `/api/v1/users`

## Fluxos Importantes

### Buscar Perfil
```
GET /api/v1/users/:id
  → authMiddleware (valida JWT, popula req.user)
  → userController.getProfile()
  → userService.getProfile(id, req.user)
    → SE req.user.sub !== id E req.user.role !== ADMIN: AppError(403)
    → userRepository.findById(id)
    → Remove campo password
  → 200 { data: user }
```

### Atualizar Usuário
```
PUT /api/v1/users/:id
  → authMiddleware
  → userController.update()
  → userService.updateUser(id, body, req.user)
    → SE req.user.sub !== id E req.user.role !== ADMIN: AppError(403)
    → SE req.user.role !== ADMIN E body.role existir: AppError(403, 'CANNOT_CHANGE_ROLE')
    → SE body.email: valida unicidade com resposta amigável
    → userRepository.update(id, data)
    → Remove campo password
  → 200 { data: user }
```

### Remover Usuário (ADMIN only)
```
DELETE /api/v1/users/:id
  → authMiddleware
  → userController.delete()
  → userService.deleteUser(id, req.user)
    → SE req.user.role !== ADMIN: AppError(403, 'ADMIN_REQUIRED')
    → userRepository.delete(id)
  → 204
```

### Alterar Senha
```
PATCH /api/v1/users/me/password
  → authMiddleware
  → userController.changePassword()
  → userService.changePassword(req.user.sub, { currentPassword, newPassword })
    → userRepository.findById(userId) → inclui campo password
    → bcrypt.compare(currentPassword, user.password)
    → SE inválida: AppError(401, 'INVALID_CURRENT_PASSWORD')
    → bcrypt.hash(newPassword, 10)
    → userRepository.update(userId, { password: hashedNewPassword })
  → 200 { data: { message: 'Password updated successfully' } }
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `userService.js` | Lógica de autorização, delegação e troca de senha |
| `userRepository.js` | Queries Prisma para a tabela User |

## Gaps e Débitos

- **Endpoint de troca de senha não implementado**: `PATCH /users/me/password` precisa ser criado.
- **Delete não restringe a ADMIN**: A implementação atual permite que o próprio usuário se delete. Deve ser bloqueado para `USER`.
- **Sem paginação para ADMIN**: Não há endpoint para ADMIN listar todos os usuários.
- **Sem validação amigável de email duplicado no update**: O erro viria do banco (Prisma P2002) sem mensagem clara.
- **[A DEFINIR]** Recuperação de senha via email ("esqueci minha senha").
