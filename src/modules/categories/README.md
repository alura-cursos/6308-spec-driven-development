# Módulo: Categories

## Objetivo

Gerenciar a taxonomia de produtos: estrutura hierárquica de categorias e subcategorias.

## Responsabilidade Principal

Fornecer operações CRUD sobre categorias, que organizam os produtos do catálogo em uma árvore pai-filho de um nível de profundidade visível na API.

## Funcionalidades Existentes

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/v1/categories` | GET | Não | Lista todas as categorias |
| `/api/v1/categories/:id` | GET | Não | Busca categoria por ID |
| `/api/v1/categories` | POST | ADMIN | Cria categoria |
| `/api/v1/categories/:id` | PUT | ADMIN | Atualiza categoria |
| `/api/v1/categories/:id` | DELETE | ADMIN | Remove categoria |

### Hierarquia

O model `Category` possui o campo `parentId` (autorreferência). A listagem retorna cada categoria com seus `children` incluídos (nível 1 de profundidade). Isso permite construir menus de categorias e subcategorias no front-end.

```
Exemplo de estrutura retornada:
{
  "id": "abc",
  "name": "Eletrônicos",
  "parentId": null,
  "children": [
    { "id": "def", "name": "Smartphones", "parentId": "abc" },
    { "id": "ghi", "name": "Notebooks", "parentId": "abc" }
  ]
}
```

### Restrição de Exclusão

Não é possível remover uma categoria que possua produtos vinculados. O banco retorna erro Prisma `P2003` (foreign key constraint), que o service captura e transforma em `AppError(409)`.

## Dependências Internas

| Módulo | Uso |
|---|---|
| `config/database` | Acesso ao Prisma Client |
| `utils/AppError` | Erros operacionais |
| `middlewares/authMiddleware` | Proteção de rotas de escrita |

## Dependências Externas

Nenhuma dependência externa específica.

## Módulos Relacionados

- **products**: Produto referencia `categoryId`. A listagem de produtos aceita `categoryId` como filtro.

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
      → inclui: children
  → 200 { data: [...categories] }
```

### Criar Categoria
```
POST /api/v1/categories
  → authMiddleware → verificar ADMIN
  → categoryController.create()
  → categoryService.createCategory({ name, parentId? })
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

## Observações Técnicas e Débitos

- **Hierarquia de um nível**: A query inclui `children` mas não faz `include` recursivo. Subcategorias de subcategorias não são retornadas.
- **Sem validação de parentId**: Ao criar uma subcategoria, o sistema não valida se o `parentId` informado existe. O erro viria do banco.
- **Sem cache**: Diferente de produtos, categorias não têm cache Redis. Como categorias mudam com menos frequência, um cache de longa duração seria benéfico.
- **Exclusão de categoria pai**: Não está claro se deletar uma categoria pai remove ou orfaniza as subcategorias. A restrição atual (P2003) provavelmente bloqueia se houver produtos. Comportamento com subcategorias sem produtos deve ser verificado.
