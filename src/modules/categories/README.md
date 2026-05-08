# Módulo: Categories

## Objetivo

Gerenciar a taxonomia de produtos: estrutura hierárquica de categorias e subcategorias.

## Responsabilidade Principal

Fornecer operações CRUD sobre categorias que organizam os produtos do catálogo em uma árvore pai-filho de profundidade ilimitada.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/categories` | GET | Não | Lista todas as categorias |
| `/api/v1/categories/:id` | GET | Não | Busca categoria por ID |
| `/api/v1/categories` | POST | ADMIN | Cria categoria |
| `/api/v1/categories/:id` | PUT | ADMIN | Atualiza categoria |
| `/api/v1/categories/:id` | DELETE | ADMIN | Remove categoria |

### Hierarquia

O model `Category` possui o campo `parentId` (autorreferência). A hierarquia é de **profundidade ilimitada** — uma categoria pode ser subcategoria de outra, que por sua vez é subcategoria de outra, sem limite de níveis.

```
Exemplo de estrutura:
Eletrônicos
└── Computadores
    ├── Notebooks
    └── Desktops
└── Smartphones
```

### Restrição de Exclusão

Não é possível remover uma categoria que possua produtos vinculados. O banco retorna erro Prisma `P2003` (foreign key constraint), que o service captura e transforma em `AppError(409)`.

## Regras de Negócio

- Apenas `ADMIN` pode criar, editar e remover categorias
- Hierarquia de profundidade ilimitada — `parentId` pode apontar para qualquer categoria existente
- Categoria só pode ser removida se **não tiver produtos associados**
- Listagem é pública — não requer autenticação
- Um produto pode pertencer a **múltiplas categorias** (relação N:N entre Product e Category)

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma Client |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Proteção de rotas de escrita |

## Módulos Relacionados

- **products**: Produto possui relação N:N com Category. A listagem de produtos aceita `categoryId` como filtro.

## Pontos de Entrada

- `categoryRoutes.js` — define rotas públicas e privadas (ADMIN)
- Exporta router para `/api/v1/categories`

## Fluxos Importantes

### Listar Categorias
```
GET /api/v1/categories
  → categoryController.list()
  → categoryService.listCategories()
    → categoryRepository.findAll()
      → inclui: children (recursivo)
  → 200 { data: [...categories] }
```

### Criar Categoria
```
POST /api/v1/categories
  → authMiddleware → verificar ADMIN
  → categoryController.create()
  → categoryService.createCategory({ name, parentId? })
    → SE parentId: valida existência da categoria pai
    → categoryRepository.create(data)
  → 201 { data: category }
```

### Remover Categoria
```
DELETE /api/v1/categories/:id
  → authMiddleware → verificar ADMIN
  → categoryController.delete()
  → categoryService.deleteCategory(id)
    → categoryRepository.delete(id)
    → Captura P2003 → AppError(409, 'CATEGORY_HAS_PRODUCTS')
  → 204
```

## Arquivos Críticos

| Arquivo | Descrição |
|---|---|
| `categoryService.js` | Lógica de negócio e tratamento do erro P2003 |
| `categoryRepository.js` | Queries Prisma com auto-relação de children |

## Gaps e Débitos

- **Hierarquia retornada com um único nível**: A query atual inclui `children` mas não faz `include` recursivo. Subcategorias de subcategorias não são retornadas. Deve ser corrigido para suportar profundidade ilimitada (via recursão no service ou query raw).
- **Sem validação de parentId**: Ao criar uma subcategoria, o sistema não valida se o `parentId` informado existe. O erro viria do banco.
- **Relação N:N não implementada**: O schema atual provavelmente usa `categoryId` direto no produto (1:N). A relação N:N (tabela `ProductCategory`) precisa ser criada para suportar múltiplas categorias por produto.
- **Sem cache**: Categorias mudam com pouca frequência — um cache Redis de longa duração seria benéfico.
- **Comportamento com subcategorias ao deletar pai**: Não está claro se deletar uma categoria pai remove ou orfaniza as subcategorias.
