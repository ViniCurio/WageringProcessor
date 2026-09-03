# Teste manual da aplicação

Este guia descreve como testar o fluxo real da aplicação com Postman, Insomnia ou qualquer outro cliente HTTP semelhante.

Os testes usam a aplicação, o PostgreSQL e o LocalStack reais. Nenhum `Player` precisa ser criado: `playerId` é o identificador externo de um jogador pertencente a outro sistema. Da mesma forma, `providerId`, `roundId` e `gameId` são identificadores externos recebidos pela aplicação.

A aplicação é responsável por criar:

- wallets;
- transações;
- lançamentos no ledger;
- mensagens de inbox e outbox;
- eventos de integração.

## 1. Iniciar o ambiente

Na raiz do projeto, execute:

```powershell
docker compose up -d --wait
bun install
bun run migration:up
bun run dev
```

Se o Bun não estiver instalado globalmente, para uma execução temporária podem ser usados:

```powershell
npx --yes bun run migration:up
npx --yes bun run dev
```

A API ficará disponível em:

```text
http://localhost:3000
```

Crie no Postman ou Insomnia uma variável de ambiente:

```text
baseUrl = http://localhost:3000
```

A autenticação está intencionalmente desabilitada por meio do `NoOpAuthGuard`, conforme permitido pelo desafio. Não é necessário enviar token.

## 2. Verificar a saúde da aplicação

### Liveness

```http
GET {{baseUrl}}/health/live
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

### Readiness

```http
GET {{baseUrl}}/health/ready
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

O readiness verifica a conectividade com PostgreSQL e SQS. Se falhar, confirme que os containers estão saudáveis:

```powershell
docker compose ps
```

## 3. Preparar os identificadores

Crie estas variáveis no ambiente do cliente HTTP:

```text
playerId = um UUID novo
providerId = provider-a
roundId = round-001
gameId = game-001
```

Exemplo de `playerId` válido:

```text
9cc35c56-02fb-4b9d-b8f7-a7e33c757517
```

Reutilize o mesmo `playerId` durante todo o fluxo.


## 4. Criar uma wallet

```http
POST {{baseUrl}}/wallets
Content-Type: application/json
```

```json
{
  "playerId": "{{playerId}}",
  "initialBalance": {
    "amount": "100.00",
    "currency": "BRL"
  }
}
```

Resposta esperada, com HTTP `201`:

```json
{
  "id": "UUID-GERADO",
  "playerId": "SEU-PLAYER-ID",
  "balance": {
    "amount": "100.00",
    "currency": "BRL"
  },
  "version": 1
}
```

Ao criar uma wallet com saldo maior que zero, a aplicação cria atomicamente:

- a wallet;
- uma transação interna `OPENING`;
- um lançamento `CREDIT` no ledger;
- os eventos correspondentes na outbox.

Não tente submeter `OPENING` pela API: essa operação é exclusivamente interna.


## 5. Consultar a wallet

```http
GET {{baseUrl}}/wallets/{{walletId}}
```

O saldo esperado é:

```json
{
  "amount": "100.00",
  "currency": "BRL"
}
```

## 6. Fazer uma aposta

```http
POST {{baseUrl}}/wagering/transactions
Content-Type: application/json
Idempotency-Key: provider-a:bet-001
X-Correlation-Id: manual-test-001
```

```json
{
  "providerId": "{{providerId}}",
  "externalTransactionId": "bet-001",
  "playerId": "{{playerId}}",
  "walletId": "{{walletId}}",
  "roundId": "{{roundId}}",
  "gameId": "{{gameId}}",
  "kind": "BET",
  "money": {
    "amount": "25.00",
    "currency": "BRL"
  }
}
```

Resposta esperada, com HTTP `200`:

```json
{
  "transactionId": "UUID-GERADO",
  "status": "PROCESSED",
  "balance": {
    "amount": "75.00",
    "currency": "BRL"
  },
  "idempotentReplay": false
}
```

Referências de negócio usam o `externalTransactionId` (`bet-001`), e não o UUID interno retornado em `transactionId`.

## 7. Testar a idempotência

Envie novamente exatamente a mesma aposta, mantendo:

```http
Idempotency-Key: provider-a:bet-001
```

A resposta deve manter o mesmo `transactionId` e o mesmo saldo, agora com:

```json
{
  "idempotentReplay": true
}
```

Nenhum novo débito ou lançamento deve ser criado.

Depois, mantenha a mesma chave e altere o valor da aposta para `26.00`. O resultado esperado é HTTP `409`, pois a mesma idempotency key foi reutilizada com payload diferente.

## 8. Registrar uma vitória

```http
POST {{baseUrl}}/wagering/transactions
Content-Type: application/json
Idempotency-Key: provider-a:win-001
```

```json
{
  "providerId": "{{providerId}}",
  "externalTransactionId": "win-001",
  "playerId": "{{playerId}}",
  "walletId": "{{walletId}}",
  "roundId": "{{roundId}}",
  "gameId": "{{gameId}}",
  "kind": "WIN",
  "money": {
    "amount": "10.00",
    "currency": "BRL"
  },
  "referenceExternalTransactionId": "bet-001"
}
```

Saldo esperado após a vitória:

```text
85.00 BRL
```

## 9. Registrar uma perda

```http
POST {{baseUrl}}/wagering/transactions
Content-Type: application/json
Idempotency-Key: provider-a:loss-001
```

```json
{
  "providerId": "{{providerId}}",
  "externalTransactionId": "loss-001",
  "playerId": "{{playerId}}",
  "walletId": "{{walletId}}",
  "roundId": "{{roundId}}",
  "gameId": "{{gameId}}",
  "kind": "LOSS",
  "money": {
    "amount": "0.00",
    "currency": "BRL"
  }
}
```

A transação deve ficar `PROCESSED`, mas o saldo continuará em `85.00`. `LOSS` não altera o saldo nem gera lançamento no ledger.

## 10. Fazer o refund da aposta

```http
POST {{baseUrl}}/wagering/transactions
Content-Type: application/json
Idempotency-Key: provider-a:refund-001
```

```json
{
  "providerId": "{{providerId}}",
  "externalTransactionId": "refund-001",
  "playerId": "{{playerId}}",
  "walletId": "{{walletId}}",
  "roundId": "{{roundId}}",
  "gameId": "{{gameId}}",
  "kind": "REFUND",
  "money": {
    "amount": "25.00",
    "currency": "BRL"
  },
  "referenceExternalTransactionId": "bet-001"
}
```

O `REFUND` deve possuir exatamente o mesmo valor da aposta referenciada. Saldo esperado:

```text
110.00 BRL
```

Repetir a mesma requisição com a mesma chave é um replay idempotente. Tentar criar outro refund, com outra identidade, para a mesma aposta resulta em rejeição por regra de negócio.

## 11. Fazer rollback da vitória

```http
POST {{baseUrl}}/wagering/transactions
Content-Type: application/json
Idempotency-Key: provider-a:rollback-001
```

```json
{
  "providerId": "{{providerId}}",
  "externalTransactionId": "rollback-001",
  "playerId": "{{playerId}}",
  "walletId": "{{walletId}}",
  "roundId": "{{roundId}}",
  "gameId": "{{gameId}}",
  "kind": "ROLLBACK",
  "money": {
    "amount": "10.00",
    "currency": "BRL"
  },
  "referenceExternalTransactionId": "win-001"
}
```

Como a vitória creditou `10.00`, o rollback debita esse valor. Saldo final esperado:

```text
100.00 BRL
```

## 12. Consultar as transações

Consulta pelo UUID interno:

```http
GET {{baseUrl}}/wagering/transactions/{{betTransactionId}}
```

Consulta pela identidade externa:

```http
GET {{baseUrl}}/providers/{{providerId}}/wagering/transactions/bet-001
```

## 13. Consultar o ledger

```http
GET {{baseUrl}}/wallets/{{walletId}}/ledger?limit=50
```

Ao final do fluxo, devem existir lançamentos para:

1. `OPENING`: crédito de `100.00`;
2. `BET`: débito de `25.00`;
3. `WIN`: crédito de `10.00`;
4. `REFUND`: crédito de `25.00`;
5. `ROLLBACK`: débito de `10.00`.

`LOSS` não deve aparecer no ledger.

O saldo reconstruído será:

```text
100.00 - 25.00 + 10.00 + 25.00 - 10.00 = 100.00
```

Para testar paginação, use um limite pequeno:

```http
GET {{baseUrl}}/wallets/{{walletId}}/ledger?limit=2
```

Copie o `nextCursor` retornado e faça:

```http
GET {{baseUrl}}/wallets/{{walletId}}/ledger?limit=2&cursor={{nextCursor}}
```

## 14. Consultar as métricas

```http
GET {{baseUrl}}/metrics
```

Entre as métricas expostas estão:

- `wager_transactions_total`;
- `wager_duplicates_total`;
- `wager_retries_total`;
- `wager_dlq_messages_total`;
- `wager_lock_conflicts_total`;
- `wager_outbox_lag_seconds`;
- `wager_processing_duration_seconds`.

## 15. Respostas HTTP relevantes

| Situação | Status esperado |
|---|---:|
| Wallet criada | `201` |
| Transação processada | `200` |
| Referência ainda inexistente | `202` |
| Payload ou header inválido | `400` |
| Recurso inexistente | `404` |
| Conflito de idempotência ou unicidade | `409` |
| Rejeição por regra de negócio | `422` |
| Infraestrutura temporariamente indisponível | `503` |

O header `Idempotency-Key` é obrigatório em toda submissão de transação. O header `X-Correlation-Id` é opcional; quando ausente, a aplicação cria um UUID.

## 16. Casos inválidos úteis

### Aposta sem saldo

Envie uma `BET` maior que o saldo disponível. A resposta deve ser HTTP `422`, com status `REJECTED` e código de saldo insuficiente.

### Valor externo igual a zero

`BET`, `WIN`, `REFUND` e `ROLLBACK` com `0.00` são payloads inválidos. `LOSS` pode usar `0.00`, pois não altera saldo.

### Referência obrigatória ausente

`REFUND` e `ROLLBACK` sem `referenceExternalTransactionId` retornam HTTP `400`.

### Operação interna enviada externamente

Uma submissão com `kind: "OPENING"` retorna HTTP `400`.

### Wallet duplicada

Criar outra wallet com o mesmo `playerId` e `BRL` retorna HTTP `409`.

## 17. Limites do teste com Postman ou Insomnia

O cliente HTTP exercita o fluxo real entre:

```text
Postman/Insomnia → NestJS → domínio → PostgreSQL → transactional outbox
```

Entretanto, um cliente HTTP não simula diretamente:

- entrega at-least-once pelo SQS;
- inbox persistente;
- redelivery após crash;
- retry e DLQ;
- publishers concorrentes;
- três processos simultâneos.

Esses comportamentos são comprovados pelos testes de integração reais:

```powershell
bun run test:integration
```

