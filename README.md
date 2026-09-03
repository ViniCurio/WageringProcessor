# Distributed Wagering Processor

Serviço distribuído para processar transações de apostas com consistência financeira, idempotência persistente e suporte a múltiplas instâncias.

## Tecnologias

- Bun e TypeScript
- NestJS
- PostgreSQL com MikroORM
- AWS SQS com LocalStack
- Docker Compose

## Pré-requisitos

- Bun 1.x instalado globalmente e disponível no `PATH`
- Docker
- Docker Compose

No Windows, instale o Bun globalmente com o comando oficial:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Reinicie o terminal ou o VS Code após a instalação e confirme:

```powershell
bun --version
```

Os scripts do projeto usam diretamente o comando `bun` e não dependem de uma execução temporária via `npx`.

## Configuração

Copie `.env.example` para `.env`:

```powershell
Copy-Item .env.example .env
```

Instale as dependências:

```powershell
bun install
```

## Executar o projeto

Inicie PostgreSQL e LocalStack:

```powershell
docker compose up -d --wait
```

Execute as migrations:

```powershell
bun run migration:up
```

Inicie a aplicação:

```powershell
bun run dev
```

A API estará disponível em `http://localhost:3000`.

## Scripts

```powershell
bun run dev               # desenvolvimento
bun run build             # compilação
bun run start             # aplicação compilada
bun run lint              # verificação TypeScript
bun test                  # todos os testes
bun run test:integration  # testes com PostgreSQL e LocalStack
bun run migration:up      # aplica migrations
bun run migration:down    # reverte a última migration
```

## Endpoints

```text
POST /wallets
GET  /wallets/:walletId
GET  /wallets/:walletId/ledger
POST /wallets/:walletId/reconciliation

POST /wagering/transactions
GET  /wagering/transactions/:transactionId
GET  /providers/:providerId/wagering/transactions/:externalTransactionId

GET  /health/live
GET  /health/ready
GET  /metrics
```

O header `Idempotency-Key` é obrigatório ao submeter uma transação.

## Documentação

- [ARCHITECTURE.md](./ARCHITECTURE.md): decisões técnicas e garantias distribuídas.
- [READMEforTEST.md](./READMEforTEST.md): instruções para testar o fluxo de produção manualmente com Postman, Insomnia ou ferramenta semelhante.
