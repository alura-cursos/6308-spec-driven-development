# Módulo: Users

## Objetivo

Gerenciar o perfil de usuários: leitura, atualização e remoção de contas.

## Responsabilidade Principal

Fornecer operações CRUD sobre entidades de usuário, com regras de autorização que garantem que usuários só acessem e modifiquem seus próprios dados, enquanto ADMINs têm acesso irrestrito.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/users/:id` | GET | Obrigatória | Busca perfil de usuário |
| `/api/v1/users/:id` | PUT | Obrigatória | Atualiza dados do usuário |
| `/api/v1/users/:id` | DELETE | Obrigatória | Remove usuário |

### Regras de Autorização

- **GET**: Próprio usuário ou ADMIN pode visualizar
- **PUT**: Próprio usuário ou ADMIN pode editar; usuário comum não pode alterar `role`
- **DELETE**: Próprio usuário ou ADMIN pode remover

### Campos Retornados

A senha (`password`) é sempre removida do response antes de retornar ao cliente.

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma Client |
| `utils/AppError` | Lançar erros de autorização e not found |
| `middlewares/authMiddleware` | Proteção de todas as rotas |

## Dependências Externas

Nenhuma dependência externa além das já presentes no projeto.

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
  → userService.getProfile(userId)
    → Valida: req.user.sub === id OU req.user.role === ADMIN
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
    → Valida autorização
    → Se req.user.role !== ADMIN e body.role existir: lança AppError(403)
    → userRepository.update(id, data)
    → Remove campo password
  → 200 { data: user }
```

### Remover Usuário
```
DELETE /api/v1/users/:id
  → authMiddleware
  → userController.delete()
  → userService.deleteUser(id, req.user)
    → Valida autorização
    → userRepository.delete(id)
  → 204
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `userService.js` | Lógica de autorização e delegação |
| `userRepository.js` | Queries Prisma para a tabela User |

## Observações Técnicas e Débitos

- **Sem paginação**: Não há endpoint para listar todos os usuários (útil para ADMIN).
- **Sem validação de unicidade no update**: Se o usuário tentar atualizar o email para um já existente, o erro virá do banco (Prisma P2002) e não de uma mensagem amigável.
- **Senha no update**: Não está claro se o update de senha revalida o hash. Verificar se `userRepository.update()` recebe a senha já hasheada ou em texto plano.
