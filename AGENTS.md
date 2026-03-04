# AGENTS.md

Este arquivo orienta o Cursor ao trabalhar com o codigo deste repositório.

## Visão Geral

API de treinos construida com Fastify 5, TypeScript, Prisma 7 e Better-Auth. Roda em Node.js 24.x com pnpm 10.30.0 (ambos obrigatórios via `engine-strict`).

## Comandos

```bash
# Iniciar servidor de desenvolvimento (hot-reload na porta 8081)
pnpm dev

# Iniciar PostgreSQL
docker-compose up -d

# Migrations do Prisma
pnpm exec prisma migrate dev
pnpm exec prisma generate

# Lint
pnpm exec eslint .

# Formatacao
pnpm exec prettier --write .
```

Não há script de build ou teste configurado ainda. TypeScript compila para `./dist` via `tsc`.

## Arquitetura

### Padrão em camadas: Routes → Use Cases → Prisma

- **Routes** (`src/routes/`) — Handlers de rotas Fastify. Registram schemas Zod para validação de request/response via `fastify-type-provider-zod`. Extraem sessão de autenticação e definem status HTTP.
- **Use Cases** (`src/usecases/`) — Classes de lógica de negócio. Recebem DTOs, usam transações Prisma para atomicidade (ex: desativar planos ativos antes de criar novos). Uma classe por caso de uso.
- **Schemas** (`src/schemas/`) — Schemas Zod compartilhados entre rotas e OpenAPI docs. Definem tanto validação de entrada quanto formato de resposta.
- **Errors** (`src/errors/`) — Classes de erro customizadas (ex: `NotFoundError`) usadas nos use cases e tratadas nas rotas.

### Autenticação

Better-Auth com adaptador Prisma (`src/lib/auth.ts`). Rotas de auth em `/api/auth/*`. Autenticação baseada em sessão — rotas extraem a sessão do usuario via `auth.api.getSession()`.

### Banco de Dados

PostgreSQL 16 via Docker. Prisma client inicializado em `src/lib/db.ts`. Tipos gerados em `src/generated/prisma/` (gitignored). Schema em `prisma/schema.prisma`.

### Documentação da API

Swagger JSON em `/swagger.json`, Scalar UI em `/docs`. Endpoints de auth são mesclados no spec OpenAPI via plugin do Better-Auth.

## Convenções

- **TypeScript strict** com target ES2024 e module resolution `nodenext`
- **ESLint** com typescript-eslint, integração com prettier e `simple-import-sort` (imports devem ser ordenados)
- **Zod 4** para validação (usa padrao `z.object()`, não `z.interface()`)
- **CORS** permite `http://localhost:3000` com credentials
- Variáveis de ambiente: `PORT`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
