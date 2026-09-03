# Guia informal e completo da aplicação

Este arquivo é um mapa mental do projeto. A ideia é conseguir voltar aqui no futuro e lembrar o que a aplicação faz, por que cada parte existe, quais dados entram, por onde eles passam, o que vai para o banco e como o sistema reage quando alguma coisa dá errado.

## 1. O que esta aplicação faz e para que ela serve

Esta aplicação é um processador distribuído de transações de apostas. Ela mantém o saldo das carteiras dos jogadores e processa operações financeiras enviadas por provedores de jogos.

Ela recebe operações por dois caminhos:

1. requisições HTTP, normalmente enviadas diretamente por um provedor;
2. mensagens assíncronas em uma fila SQS.

Os dois caminhos terminam no mesmo método de negócio, `WageringService.execute`. `WageringService` significa “serviço de apostas” e `execute` significa “executar o comando recebido”. Isso evita ter uma regra para HTTP e outra regra diferente para fila.

O objetivo principal não é apenas somar e subtrair saldo. A aplicação precisa continuar correta quando:

- a mesma operação chega várias vezes;
- duas operações tentam gastar o mesmo saldo ao mesmo tempo;
- existem várias instâncias da aplicação rodando;
- uma reversão chega antes da operação original;
- o processo morre depois de confirmar o banco, mas antes de confirmar a mensagem;
- o processo morre depois de publicar um evento, mas antes de marcá-lo como publicado;
- PostgreSQL ou SQS apresentam uma falha temporária.

As quatro garantias centrais são:

- não duplicar crédito;
- não duplicar débito;
- nunca deixar o saldo negativo;
- não perder eventos correspondentes a transações já confirmadas.

## 2. Dicionário rápido dos nomes em inglês usados no projeto

Estes nomes aparecem várias vezes no código e nos fluxos abaixo:

- **Wallet** significa carteira. É o objeto que pertence a um jogador, guarda moeda, saldo e versão.
- **Wager** significa aposta. No projeto, o termo aparece nas transações relacionadas ao jogo.
- **Transaction** significa transação. É o registro de uma operação recebida, inclusive operações que não alteram saldo.
- **Ledger** significa livro-razão. É o histórico financeiro imutável de créditos e débitos da wallet.
- **Entry** significa lançamento ou entrada. `WalletLedgerEntry` é um lançamento individual do ledger.
- **Balance** significa saldo. `balanceBefore` é o saldo anterior e `balanceAfter` é o saldo depois do lançamento.
- **Debit** significa débito, isto é, retirada de saldo.
- **Credit** significa crédito, isto é, adição de saldo.
- **Provider** significa provedor de jogos. `providerId` identifica quem enviou a operação.
- **Player** significa jogador. `playerId` identifica o dono da wallet.
- **Round** significa rodada do jogo. `roundId` agrupa as operações da mesma rodada.
- **Game** significa jogo. `gameId` identifica o jogo.
- **Payload** significa o conteúdo útil de uma requisição, mensagem ou evento.
- **DTO**, abreviação de Data Transfer Object, significa objeto de transferência de dados. Ele representa o formato aceito na borda HTTP e valida a entrada antes de ela chegar ao negócio.
- **Command** significa comando. `SubmitTransactionCommand` é o objeto interno que diz ao caso de uso qual transação deve ser processada.
- **Service** significa serviço. É uma classe que coordena um caso de uso, como abrir wallet ou processar aposta.
- **Controller** significa controlador. É a classe da camada HTTP que recebe a rota, lê parâmetros e delega para um serviço.
- **Port** significa porta. É um contrato interno que descreve o que a aplicação precisa sem dizer qual tecnologia fará o trabalho.
- **Adapter** significa adaptador. É a implementação concreta de uma porta; neste projeto o adaptador usa PostgreSQL e MikroORM.
- **Mapper** significa mapeador. Converte uma representação em outra, por exemplo `WalletRecord` do banco em `Wallet` do domínio.
- **Record** significa registro de persistência. As classes terminadas em `Record` representam o formato das tabelas para o ORM e nunca são devolvidas pela API.
- **Worker** significa processo de trabalho em segundo plano. Ele procura tarefas pendentes e executa sem uma requisição HTTP direta.
- **Inbox** significa caixa de entrada. Guarda as mensagens SQS já processadas para impedir que um redelivery repita o efeito financeiro.
- **Outbox** significa caixa de saída. Guarda eventos no banco antes de publicá-los na fila.
- **Replay** significa repetição idempotente. A operação já existia e a aplicação devolve o resultado original sem aplicar o saldo novamente.
- **Idempotency** significa idempotência. Repetir a mesma requisição produz o mesmo efeito de uma única execução.
- **Hash** é uma impressão digital dos dados. O projeto usa o hash para saber se uma chave de idempotência voltou com o mesmo conteúdo ou com conteúdo diferente.
- **Lock** significa bloqueio. Um lock da wallet impede duas transações concorrentes de modificarem o mesmo saldo ao mesmo tempo.
- **Commit** significa confirmação definitiva de uma transação SQL.
- **Rollback** pode ter dois sentidos. No banco, significa desfazer uma transação SQL que falhou. No domínio, `ROLLBACK` é uma operação financeira que inverte outra transação processada.
- **Ack**, abreviação de acknowledgement, significa confirmação da mensagem. Ao fazer ack, o consumidor remove a mensagem processada da fila original.
- **Retry** significa nova tentativa depois de uma falha temporária.
- **Backoff** significa aumentar o intervalo entre retries para não sobrecarregar um serviço indisponível.
- **DLQ**, abreviação de Dead Letter Queue, significa fila de mensagens que não puderam ser processadas definitivamente.
- **Claim** significa reivindicar um trabalho. Um worker marca registros da outbox como temporariamente pertencentes a ele.
- **Lease** significa posse temporária. Se o worker morrer, o lease expira e outro worker pode assumir.
- **Correlation ID** é um identificador usado para relacionar logs e ações do mesmo fluxo.
- **Causation ID** identifica qual comando ou transação causou um evento.
- **Health check** é uma verificação de saúde. `live` verifica se o processo está vivo; `ready` verifica se ele está pronto para trabalhar.
- **Cursor** é um marcador de paginação. Ele informa de onde a próxima página do ledger deve continuar.
- **Integration event** significa evento de integração. É uma mensagem pública sobre algo que aconteceu e que pode ser consumida por outro sistema.
- **Factory** significa método de fabricação. Métodos como `create`, `open`, `receive` e `enqueue` criam objetos novos respeitando as regras do domínio.
- **Rehydrate** significa reidratar. O método `rehydrate` reconstrói um objeto que já estava persistido sem tentar executar novamente as regras da criação original.

## 3. Ferramentas e bibliotecas usadas

### Bun

Bun é o runtime, gerenciador de pacotes e executor de testes do projeto. Runtime é o programa que realmente executa o JavaScript gerado pelo TypeScript. Ele é usado quando rodamos `bun run dev`, `bun run start`, migrations ou testes. Também lê o `package.json`, instala as dependências registradas no `bun.lock` e executa a suíte escrita com `bun:test`.

### TypeScript

TypeScript adiciona tipos ao JavaScript. Ele serve para detectar formatos errados, métodos inexistentes e combinações inválidas antes de a aplicação rodar. O arquivo `tsconfig.json` ativa o modo estrito, decorators e a geração para a pasta `dist`. Ele é acionado por `bun run build`, que gera JavaScript, e por `bun run lint`, que faz a análise de tipos sem gerar arquivos.

### NestJS

NestJS é o framework da aplicação. Framework é a estrutura que monta controllers, serviços, injeção de dependência, filtros e ciclo de vida. Ele entra no `src/main.ts`, cria a aplicação a partir de `AppModule` e conecta os objetos cadastrados em `providers`. Também fornece os decorators `Controller`, `Get`, `Post` e `Injectable`, usados para declarar rotas e componentes.

### PostgreSQL

PostgreSQL é o banco relacional e a fonte final da verdade. Ele persiste wallets, transações, ledger, inbox e outbox. Também fornece as garantias que precisam continuar válidas entre várias instâncias: constraints, índices únicos, transações SQL, foreign keys e locks por linha. Ele é iniciado pelo `compose.yml` e acessado na porta 5432.

### Docker e Docker Compose

Docker executa serviços em containers isolados. Docker Compose lê o `compose.yml` e sobe PostgreSQL e LocalStack juntos com `docker compose up -d --wait`. Ele também executa health checks e mantém o volume `postgres-data`, que preserva o banco entre reinícios dos containers.

### LocalStack

LocalStack simula serviços da AWS localmente. Neste projeto ele fornece uma implementação local do SQS na porta 4566. Quando o container fica pronto, o arquivo `docker/localstack/init-queues.sh` cria as filas FIFO de comandos, eventos e DLQs. Assim é possível testar mensageria real sem uma conta AWS.

### AWS SQS e AWS SDK v3

SQS, ou Simple Queue Service, é o serviço de filas usado para receber comandos e publicar eventos. O pacote `@aws-sdk/client-sqs`, chamado aqui de AWS SDK v3, é a biblioteca que envia os comandos de receber, publicar, alterar visibilidade, consultar atributos e excluir mensagens. Ele é usado dentro de `SqsClientService` e `WagerConsumer`.

As filas são:

- `wager-transactions.fifo`: recebe comandos de transação;
- `wager-transactions-dlq.fifo`: recebe comandos permanentemente inválidos ou que esgotaram retries;
- `wager-events.fifo`: recebe eventos publicados pela outbox;
- `wager-events-dlq.fifo`: fila preparada para falhas de consumidores dos eventos.

FIFO significa First In, First Out, ou primeiro a entrar, primeiro a sair. Ajuda na ordem, mas não é a garantia financeira final; essa responsabilidade continua no PostgreSQL.

### MikroORM

MikroORM é o ORM escolhido. ORM significa Object-Relational Mapper, uma ferramenta que traduz objetos TypeScript para linhas SQL e linhas SQL para objetos. Ele foi escolhido porque oferece transações, Unit of Work e locks pessimistas de forma direta. Unit of Work é o mecanismo que acompanha as alterações feitas nos records e envia tudo ao banco no flush ou commit.

MikroORM é acionado por `MikroOrmPersistenceAdapter`, pelas entidades em `entities.ts`, pelas migrations e pelos workers que precisam executar SQL específico.

### decimal.js

`decimal.js` é a biblioteca de aritmética decimal exata. Ela existe porque o tipo `number` do JavaScript usa ponto flutuante e pode introduzir erros em dinheiro. O objeto `Money` encapsula essa biblioteca, e `WalletService.reconcile` a usa para reconstruir o saldo. Valores monetários entram e saem como strings, como `"25.00"`.

### class-validator e class-transformer

`class-validator` valida os DTOs HTTP usando decorators como `IsUUID`, `IsString`, `IsEnum` e `Matches`. `class-transformer` transforma o JSON recebido em instâncias dos DTOs, inclusive o objeto interno de dinheiro. As duas bibliotecas são acionadas pelo `ValidationPipe` global configurado em `src/main.ts`.

### node:crypto

`node:crypto` é um módulo nativo do runtime. Ele gera UUIDs e calcula SHA-256. UUID é um identificador praticamente único. SHA-256 é o algoritmo que produz o `payloadHash` usado na idempotência. Ele aparece em `canonical-hash.ts`, nos eventos e nos objetos criados pelo domínio.

### prom-client

`prom-client` cria métricas no formato Prometheus. Prometheus é um padrão e uma ferramenta de coleta de métricas operacionais. A biblioteca registra contadores, histogramas e gauges em `MetricsService`, e o `MetricsController` expõe tudo na rota `GET /metrics`.

### @nestjs/schedule

`@nestjs/schedule` agenda tarefas periódicas dentro do NestJS. O decorator `Interval` chama o worker da outbox a cada 500 ms e o worker de referências pendentes a cada 1 segundo.

### reflect-metadata e RxJS

`reflect-metadata` fornece metadados usados pelos decorators e pela injeção de dependência do NestJS; ele é carregado logo no início de `src/main.ts`. RxJS é a biblioteca reativa usada internamente pelo NestJS em seu funcionamento, mesmo que as regras de negócio deste projeto usem principalmente `Promise` e `async/await`.

## 4. Visão geral das camadas e do caminho dos dados

O fluxo principal pode ser imaginado assim:

```text
JSON HTTP                         JSON da mensagem SQS
   |                                      |
DTO + Controller                    WagerConsumer
   |                                      |
   +---------- SubmitTransactionCommand --+
                         |
                WageringService.execute
                         |
       Money + Wallet + WagerTransaction + Ledger
                         |
                  PersistencePort
                         |
          MikroOrmPersistenceAdapter + Mappers
                         |
   PostgreSQL: wallet + transaction + ledger + inbox + outbox
                                                   |
                                             OutboxWorker
                                                   |
                                           wager-events.fifo
```

O dado muda de representação porque cada camada tem uma responsabilidade diferente:

1. o cliente envia JSON;
2. a borda HTTP transforma o JSON em DTO;
3. o controller cria um comando da aplicação;
4. o serviço cria objetos de domínio, que contêm comportamento;
5. a `PersistencePort` recebe apenas objetos de domínio;
6. os mappers convertem o domínio em records;
7. o adaptador persiste os records nas tabelas;
8. consultas fazem o caminho inverso: tabela, record, mapper, domínio, view e JSON de resposta.

## 5. Como a aplicação inicia

### `src/main.ts`

A função `bootstrap` significa inicializar a aplicação. Ela:

1. chama `NestFactory.create`, que monta o NestJS usando `AppModule`;
2. instala `JsonLogger`, o logger que escreve uma linha JSON por log;
3. instala `ValidationPipe`, que valida DTOs, remove campos desconhecidos e rejeita campos extras;
4. instala `ApiExceptionFilter`, que converte erros internos em respostas HTTP;
5. chama `enableShutdownHooks`, permitindo que componentes concluam o encerramento quando o processo recebe um sinal;
6. abre a porta configurada em `PORT`, usando 3000 por padrão.

### `src/app.module.ts`

`AppModule` é o módulo raiz. Ele registra:

- MikroORM e seus records;
- o agendador dos workers;
- todos os controllers HTTP;
- `MikroOrmPersistenceAdapter` como implementação de `PersistencePort`;
- `WalletService`, `WageringService`, `PendingReferenceService` e `TransactionQueryService`;
- integração SQS, métricas e workers;
- `NoOpAuthGuard` como guard global.

Injeção de dependência significa que o NestJS cria esses objetos e entrega as dependências corretas aos construtores. Por exemplo, `WageringService` pede uma `PersistencePort`, e `AppModule` informa que ela deve ser atendida pelo `MikroOrmPersistenceAdapter`.

## 6. Requisições HTTP disponíveis

### `POST /wallets`

Cria uma wallet.

Entrada:

```json
{
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "initialBalance": { "amount": "1000.00", "currency": "BRL" }
}
```

O método `WalletController.create` recebe `CreateWalletDto`. `CreateWalletDto` valida que `playerId` é UUID e que `initialBalance` contém um `MoneyDto`. `MoneyDto` exige valor não negativo com duas casas e moeda BRL.

Depois, `WalletService.create`:

1. transforma o DTO monetário em `Money` usando `Money.from`;
2. abre uma transação pela `PersistencePort.transactional`;
3. cria a aggregate `Wallet` com `Wallet.open`;
4. chama `addWallet` no adaptador;
5. se o saldo inicial for maior que zero, cria uma transação interna `OPENING`;
6. cria um ledger `CREDIT` de zero até o saldo inicial;
7. cria os eventos `WalletBalanceChanged` e `WagerTransactionProcessed`;
8. grava wallet, transação, ledger e outbox no mesmo commit;
9. devolve id, jogador, saldo e versão.

`OPENING` significa abertura. É uma transação interna usada para explicar contabilmente de onde veio o saldo inicial. Ela não pode ser submetida externamente.

Se já existir wallet para a mesma combinação de jogador e moeda, o índice único do PostgreSQL gera conflito. O adaptador converte isso em `ConflictError`, e a API responde HTTP 409.

### `GET /wallets/:walletId`

Consulta a wallet pelo identificador.

`WalletController.get` chama `WalletService.get`, que usa `PersistencePort.findWallet`. O adaptador lê `WalletRecord`, `WalletMapper.toDomain` reidrata `Wallet`, e o serviço devolve uma view simples com saldo em string. Se não existir, lança `NotFoundError`, convertido em HTTP 404.

### `GET /wallets/:walletId/ledger?cursor=...&limit=50`

Lista o ledger da wallet em ordem estável.

`WalletController.ledger` lê `cursor` e `limit`. `WalletService.ledger` primeiro confirma que a wallet existe. Depois decodifica o cursor Base64 URL-safe. Dentro dele existem `createdAt|id`, ou seja, data de criação e identificador do último lançamento visto.

`MikroOrmPersistenceAdapter.listLedger` procura registros posteriores a esse par, ordena por data e id e limita a página a no máximo 100 itens. `LedgerMapper.toDomain` transforma cada `LedgerRecord` em `WalletLedgerEntry`. A resposta contém lançamentos e um novo `nextCursor`, que significa cursor da próxima página.

### `POST /wallets/:walletId/reconciliation`

Reconcilia a wallet.

`WalletController.reconcile` chama `WalletService.reconcile`. O método lê o saldo materializado da wallet e reconstrói o saldo do zero, somando cada `CREDIT` e subtraindo cada `DEBIT` do ledger.

Se os dois valores forem iguais, `consistent` é verdadeiro. Se forem diferentes, a aplicação não corrige silenciosamente: escreve um log `wallet_reconciliation_divergence`, incrementa a métrica de divergências e devolve a diferença na resposta.

### `POST /wagering/transactions`

Submete uma operação de aposta.

Headers importantes:

```text
Idempotency-Key: provider-a:transaction-123
X-Correlation-Id: identificador-opcional-do-fluxo
```

`Idempotency-Key` é obrigatório. `X-Correlation-Id` é opcional; se não vier, o controller gera um UUID.

Entrada:

```json
{
  "providerId": "provider-a",
  "externalTransactionId": "transaction-123",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "roundId": "round-987",
  "gameId": "fortune-chimp",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" },
  "referenceExternalTransactionId": "opcional"
}
```

`WagerController.submit` valida `SubmitWagerDto`, lê os headers e cria `SubmitTransactionCommand`. Esse comando é um contrato interno que reúne dados de negócio, chave idempotente, correlação e, quando veio da fila, informações do inbox.

O controller chama `WageringService.execute`. A resposta contém:

- `transactionId`: identificador interno;
- `status`: estado atual;
- `balance`: saldo observado por aquela transação;
- `idempotentReplay`: informa se foi uma repetição;
- `failureCode`: código estável quando houve rejeição.

Status HTTP usados:

- 200 para processada ou replay;
- 202 para `PENDING_REFERENCE`, que significa referência pendente;
- 400 para requisição inválida, como ausência do header obrigatório;
- 404 para recurso inexistente;
- 409 para conflito de identidade ou idempotência;
- 422 para rejeição de regra de negócio;
- 503 para falhas transitórias de infraestrutura reconhecidas.

### `GET /wagering/transactions/:transactionId`

Consulta pelo identificador interno. `TransactionQueryService.byId` usa a porta de persistência, recebe `StoredTransaction` e chama seu mapper privado `map`. Esse `map` significa mapear para `TransactionView`, o formato de consulta que pode ser devolvido pela API sem expor um record do ORM.

### `GET /providers/:providerId/wagering/transactions/:externalTransactionId`

Consulta pela identidade dada pelo provedor. `ProviderTransactionController.get` chama `TransactionQueryService.byExternalId`, que procura pelo par provedor e identificador externo e devolve a mesma `TransactionView`.

### `GET /health/live`

Liveness, ou vivacidade. `HealthController.live` apenas confirma que o processo HTTP está respondendo e devolve `{ "status": "ok" }`.

### `GET /health/ready`

Readiness, ou prontidão. `HealthController.ready` executa `select 1` no PostgreSQL e consulta atributos das filas de comandos e eventos no SQS. Só devolve sucesso se as dependências essenciais estiverem acessíveis.

### `GET /metrics`

`MetricsController.get` devolve as métricas registradas pelo `prom-client` no formato Prometheus.

## 7. Caminho completo de uma transação de aposta

Aqui está o que `WageringService.execute` faz, na ordem real:

1. inicia o cronômetro `processingLatency`, que mede a duração;
2. chama `canonicalHash`, que ordena recursivamente as chaves do JSON de negócio e calcula SHA-256;
3. abre uma transação SQL usando `PersistencePort.transactional`;
4. procura uma transação com a mesma chave idempotente;
5. se encontrar, compara o hash. Hash igual vira replay; hash diferente vira conflito;
6. em replay vindo do SQS, também valida ou grava o inbox da mensagem;
7. bloqueia somente a linha da wallet usando `lockWallet`, que aplica lock pessimista;
8. verifica a chave idempotente novamente depois do lock, porque outra instância pode ter confirmado enquanto esta esperava;
9. cria `WagerTransaction` em estado `PENDING`, que significa pendente de decisão;
10. persiste o primeiro estado da transação;
11. se a origem foi SQS, cria e marca `InboxMessage` como processada;
12. confirma se jogador e moeda combinam com a wallet;
13. resolve e valida referência quando ela é necessária ou quando um `WIN` informa referência;
14. aplica débito, crédito ou nenhum movimento na `Wallet`;
15. cria `WalletLedgerEntry` quando o saldo mudou;
16. altera o estado da transação para processada, rejeitada ou pendente de referência;
17. cria os integration events correspondentes;
18. converte objetos em records pelos mappers;
19. confirma tudo junto no commit do PostgreSQL;
20. escreve log estruturado e encerra a medição de latência.

Nada é publicado diretamente no SQS dentro dessa transação. O evento entra primeiro na outbox. Isso impede confirmar dinheiro e perder o evento caso o SQS esteja fora do ar.

Depois da separação dos casos de uso, `WageringService` contém somente o processamento inicial compartilhado pelas entradas HTTP e SQS. `PendingReferenceService` contém somente a retomada agendada. O arquivo `wagering.helpers.ts` mantém apenas três conversões realmente usadas pelos dois fluxos: `storedTransactionState` monta o estado persistível, `wagerEventData` monta os dados comuns dos eventos e `enqueueWagerEvent` converte um evento de integração em mensagem de outbox. Essas funções não decidem regras de negócio.

## 8. Regra de cada tipo de operação

### `BET`

`BET` significa aposta. `ledgerDirectionFor` devolve `DEBIT`. `Wallet.debit` confere a moeda, verifica se existe saldo e subtrai o valor. Sem saldo suficiente, a transação vira `REJECTED` com `INSUFFICIENT_FUNDS`, não altera wallet e não cria ledger.

### `WIN`

`WIN` significa vitória. Gera `CREDIT`. Pode ter referência para uma `BET` processada na mesma combinação de provedor, jogador, wallet, moeda e rodada. Quando a referência é informada, ela é validada. O valor de `WIN` não precisa ser igual ao valor da aposta.

### `LOSS`

`LOSS` significa derrota. A transação é registrada como processada, mas `affectsBalance` devolve falso. Portanto não altera wallet, não incrementa versão e não cria ledger. Mesmo assim gera `WagerTransactionProcessed`.

### `REFUND`

`REFUND` significa reembolso. Exige `referenceExternalTransactionId`, só pode referenciar uma `BET` processada e deve ter exatamente o mesmo valor. Gera um `CREDIT`. O mesmo `BET` não pode receber dois refunds processados.

### `ROLLBACK`

`ROLLBACK` significa reversão. Exige referência e pode inverter `BET`, `WIN` ou `REFUND`. `ledgerDirectionFor` consulta a direção da referência e usa a direção oposta. O valor precisa ser igual. Se a inversão exigir um débito que deixaria o saldo negativo, usa `REVERSAL_INSUFFICIENT_FUNDS`, diferente da falta de saldo de uma aposta.

### `OPENING`

`OPENING` significa abertura. Só é criado dentro de `WalletService.create`. Uma tentativa externa é bloqueada por `WageringService.execute`.

## 9. Referências fora de ordem

Se `REFUND`, `ROLLBACK` ou um `WIN` com referência chegar antes da operação original, a transação é persistida como `PENDING_REFERENCE`. Ela recebe `nextAttemptAt`, que significa horário da próxima tentativa, e gera `WagerTransactionPendingReference`.

`PendingReferenceWorker` significa worker de referências pendentes. A cada segundo, seu método `tick`, que significa executar uma rodada do worker, busca até 20 transações vencidas. Ele chama `PendingReferenceService.retry`.

`PendingReferenceService` é o caso de uso separado responsável apenas por retomar operações cuja referência chegou fora de ordem. Seu método `retry` bloqueia a própria transação pendente, procura a referência e:

- se ainda não existir, incrementa `pendingAttempts` e agenda novo horário com backoff exponencial;
- se atingir oito tentativas, rejeita com `REFERENCE_NOT_FOUND` e cria `WagerTransactionRejected`;
- se a referência existir mas for incompatível, rejeita com o código correspondente;
- se já houver reversão processada do mesmo tipo, rejeita como duplicada;
- se estiver válida, bloqueia a wallet, aplica o movimento e grava transação, saldo, ledger e eventos juntos.

O intervalo cresce exponencialmente e é limitado a cinco minutos.

## 10. Idempotência HTTP e inbox SQS

### Chave e hash

A coluna `idempotency_key` é única. O `payloadHash` ignora metadados de transporte e usa somente campos de negócio. Isso permite distinguir:

- mesma chave e mesmo hash: replay seguro;
- mesma chave e hash diferente: conflito, porque alguém tentou reutilizar a identidade com outro conteúdo.

`resultingBalance` guarda o saldo visto na execução original. Por isso um replay antigo não devolve o saldo atual da wallet; ele devolve exatamente o saldo que aquela transação observou.

### Inbox

Para SQS, a aplicação também persiste `InboxMessage` com `consumerName`, `messageId`, `payloadHash`, `receivedAt` e `processedAt`. A tabela tem unicidade por consumidor e mensagem.

Inbox e efeito financeiro entram no mesmo commit. Se o processo morrer depois do commit e antes do ack, o SQS entrega de novo. Na nova execução, inbox e idempotência impedem outro débito. Se a transação foi criada antes por HTTP e depois reaparece em SQS, a aplicação registra o inbox do novo canal sem repetir o efeito.

## 11. Caminho completo de uma mensagem SQS

A mensagem de comando tem este envelope:

```json
{
  "messageId": "msg-123",
  "type": "WagerTransactionRequested",
  "occurredAt": "2026-07-29T15:00:00.000Z",
  "data": {
    "providerId": "provider-a",
    "externalTransactionId": "transaction-123",
    "idempotencyKey": "provider-a:transaction-123",
    "playerId": "uuid-do-jogador",
    "walletId": "uuid-da-wallet",
    "roundId": "round-987",
    "gameId": "fortune-chimp",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }
}
```

`WagerEnvelope` significa envelope da aposta. Ele separa metadados da mensagem do objeto `data` que contém o comando.

O fluxo do `WagerConsumer` é:

1. `onModuleInit` inicia `poll` quando os workers estão habilitados;
2. `poll` faz long polling de até 10 segundos e recebe até 10 mensagens;
3. `processMessage` lê corpo e número de recebimentos;
4. `parse` converte JSON e valida a estrutura mínima do envelope;
5. o `messageId` vira correlation ID e também identifica o inbox;
6. `canonicalHash` calcula o hash da mensagem;
7. o consumidor chama o mesmo `WageringService.execute` usado pelo HTTP;
8. somente depois do retorno e do commit, `ack` envia `DeleteMessageCommand` e remove a mensagem;
9. erro de negócio é terminal e recebe ack, pois uma nova tentativa não mudaria o resultado;
10. JSON ou envelope malformado é permanente: o corpo vai para a DLQ e a original recebe ack;
11. erro transitório recebe `ChangeMessageVisibilityCommand`, que esconde a mensagem por um intervalo crescente;
12. no quinto recebimento de uma falha transitória, a mensagem vai explicitamente para a DLQ;
13. no encerramento, `onApplicationShutdown` para novas buscas e espera o loop atual terminar.

## 12. Outbox e publicação de eventos

### Por que existe

Não é possível fazer um único commit atômico envolvendo PostgreSQL e SQS. Se a aplicação alterasse o saldo e depois publicasse diretamente, poderia morrer no meio. A outbox resolve isso gravando a intenção de publicação junto com o dinheiro.

### Objetos e tabelas

Uma subclasse de `IntegrationEvent` cria o envelope. `OutboxMessage.enqueue` transforma o evento em mensagem durável. `OutboxMapper.toPersistence` converte para `OutboxRecord`, salvo em `outbox_messages`.

### Publicação

`OutboxWorker.tick` roda a cada 500 ms. Primeiro mede o atraso do evento mais antigo. Depois chama `claim(20)`.

`claim` usa `FOR UPDATE SKIP LOCKED`. `FOR UPDATE` bloqueia as linhas escolhidas; `SKIP LOCKED` manda ignorar linhas que outro publisher já está usando. No mesmo SQL, o worker grava seu `workerId` em `locked_by` e um prazo de 30 segundos em `locked_until`.

Depois da transação curta do claim:

1. `SqsClientService.publish` serializa o payload;
2. envia para `wager-events.fifo`;
3. usa a wallet como `MessageGroupId`, mantendo ordem dentro daquele aggregate;
4. usa `eventId` como `MessageDeduplicationId`;
5. em sucesso, marca `published_at` somente se ainda for dono do lease;
6. em falha, incrementa tentativas, calcula backoff limitado a 60 segundos e libera o lease.

Se o worker morrer, `locked_until` expira e outro worker pode fazer claim. Se morrer depois de enviar e antes de marcar sucesso, o evento pode sair duas vezes. Isso é entrega at-least-once, ou pelo menos uma vez; por isso o consumidor do evento deve deduplicar `eventId`.

## 13. Eventos produzidos

`IntegrationEvent` é a classe abstrata comum. Ela garante `eventId`, `eventType`, aggregate, correlação, causa, data, versão e dados. `toJSON` transforma a data em ISO-8601 e produz o payload estável da outbox.

Eventos concretos:

- `WagerTransactionProcessed`: informa que uma transação foi aplicada, inclusive `LOSS`;
- `WagerTransactionRejected`: informa uma rejeição e leva o `failureCode` quando disponível;
- `WagerTransactionPendingReference`: informa que a referência ainda não existe;
- `WalletBalanceChanged`: existe somente quando o saldo realmente mudou e inclui valor, direção, saldo anterior, saldo posterior e versão.

Cada classe concreta possui seu próprio `eventType` e `version`, evitando strings escolhidas livremente durante o processamento.

## 14. Objetos de domínio e seus métodos

### `Money`

`Money` significa dinheiro. É imutável: uma soma não modifica o objeto original, cria outro.

- `from`: cria valor não negativo com escala 2 e moeda de três letras;
- `zero`: cria zero na moeda informada;
- `add`: soma dinheiro da mesma moeda;
- `subtract`: subtrai dinheiro da mesma moeda;
- `negate`: troca o sinal;
- `isZero`, `isPositive`, `isNegative`: consultam o sinal;
- `isLessThan`: compara dois valores da mesma moeda;
- `equals`: compara valor e moeda;
- `toJSON`: gera `{ amount, currency }`;
- `toString`: gera somente o decimal com duas casas;
- `assertSameCurrency`: bloqueia operações entre moedas diferentes.

### `Wallet`

`Wallet` é o aggregate root, ou raiz do agregado: o objeto responsável por proteger as invariantes do saldo.

- `open`: cria wallet nova com versão 1;
- `rehydrate`: reconstrói wallet persistida;
- `debit`: valida moeda e saldo antes de retirar;
- `credit`: valida moeda antes de adicionar;
- `apply`: atualiza saldo, versão e data somente se o valor mudou;
- `assertSameCurrency`: impede movimentação em outra moeda.

### `WagerTransaction`

`WagerTransaction` representa a operação e sua máquina de estados.

- `create`: cria uma transação nova em `PENDING` e exige referência para refund/rollback;
- `rehydrate`: reconstrói o estado persistido;
- `markProcessed`: marca como processada e registra referência/data;
- `markPendingReference`: marca como aguardando referência;
- `reject`: marca rejeição e código;
- `fail`: existe para marcar falha permanente de infraestrutura auditável;
- `isTerminal`: informa se não pode mais mudar;
- `affectsBalance`: informa se mexe em saldo;
- `requiresReference`: informa se a referência é obrigatória;
- `matchesPayload`: compara o hash idempotente;
- `validateReference`: verifica no domínio se a transação referenciada está processada e se provider, player, wallet, moeda, rodada, tipo e valor são compatíveis;
- `ledgerDirectionFor`: decide crédito ou débito;
- `assertMutable`: impede transição depois de `PROCESSED`, `REJECTED` ou `FAILED`.

### `WalletLedgerEntry`

`WalletLedgerEntry` representa um lançamento imutável.

- `create`: cria e valida a aritmética;
- `rehydrate`: reconstrói o lançamento persistido;
- `isBalanced`: confirma que saldo anterior mais crédito ou menos débito é igual ao saldo posterior.

### `InboxMessage`

`InboxMessage` representa uma mensagem recebida.

- `receive`: cria a entrada;
- `rehydrate`: reconstrói do banco;
- `isProcessed`: informa se terminou;
- `markProcessed`: registra a data de processamento uma única vez.

### `OutboxMessage`

`OutboxMessage` representa um evento aguardando publicação.

- `enqueue`: cria a mensagem a partir de `IntegrationEvent`;
- `rehydrate`: reconstrói do banco;
- `isPending`: informa se ainda não foi publicada;
- `isDue`: informa se já chegou a hora de tentar;
- `markPublished`: marca sucesso;
- `scheduleRetry`: incrementa tentativas e calcula o próximo horário.

## 15. Porta, adaptador, mappers e records

### `PersistencePort`

`PersistencePort` é o contrato que a camada de aplicação conhece. Ela oferece transação, consultas de wallet, ledger e transação. `PersistenceTransaction` é a visão usada dentro de um commit e oferece operações como `lockWallet`, `addLedger` e `enqueue`.

`StoredTransaction` significa transação armazenada. Ele reúne o objeto de domínio com saldo resultante, tentativas pendentes e próxima tentativa. Isso permite devolver a informação persistida sem expor `TransactionRecord`.

### `MikroOrmPersistenceAdapter`

`MikroOrmPersistenceAdapter` implementa a porta com MikroORM. Seu método `transactional` abre a transação SQL e cria `MikroOrmPersistenceTransaction`, objeto que concentra todas as operações daquele commit.

Métodos de leitura usam `EntityManager.fork`. `fork` cria um contexto de ORM isolado para evitar misturar Identity Maps entre requests ou workers.

`flushConflict` tenta enviar alterações e converte violação única PostgreSQL de código `23505` em conflito de aplicação.

### Mappers

- `WalletMapper`: converte `WalletRecord` e `Wallet`;
- `TransactionMapper`: converte `TransactionRecord`, `WagerTransaction` e `StoredTransaction`;
- `InboxMapper`: converte inbox do domínio e banco;
- `OutboxMapper`: converte outbox do domínio e banco;
- `LedgerMapper`: converte ledger do domínio e banco.

Os mappers não consultam banco nem decidem regra de negócio. Eles só traduzem formatos.

### Records e tabelas

- `WalletRecord` representa `wallets`: jogador, moeda, saldo, versão e datas;
- `TransactionRecord` representa `wager_transactions`: identidade, tipo, valor, referência, estado, saldo resultante e retries;
- `LedgerRecord` representa `wallet_ledger_entries`: direção, valor e saldos anterior/posterior;
- `InboxRecord` representa `inbox_messages`: deduplicação do consumidor;
- `OutboxRecord` representa `outbox_messages`: evento, tentativas, publicação e lease.

## 16. Garantias aplicadas pelo banco

A primeira migration cria:

- uma wallet por jogador e moeda;
- saldo não negativo e versão mínima 1;
- chave idempotente única;
- identidade externa única por provedor;
- tipos e estados permitidos;
- um ledger por transação;
- aritmética válida no ledger;
- inbox único por consumidor e mensagem;
- trigger que rejeita update ou delete no ledger;
- índices de paginação e busca da outbox.

A segunda migration adiciona `locked_by`, `locked_until` e o índice de claim da outbox.

A terceira migration ajusta os índices de refund e rollback para considerar reversão única quando o status é `PROCESSED`.

As migrations têm métodos `up`, que aplicam mudanças, e `down`, que revertem. `migrate.ts` abre o ORM, escolhe a direção conforme o argumento e fecha a conexão.

## 17. Concorrência e atomicidade

A unidade de concorrência é a wallet. `lockWallet` usa lock pessimista de escrita, equivalente ao `SELECT FOR UPDATE`. Duas apostas para a mesma wallet entram em fila no PostgreSQL. Wallets diferentes bloqueiam linhas diferentes e continuam em paralelo.

Depois de obter o lock, a aplicação verifica novamente a idempotência. Isso fecha a janela em que duas instâncias poderiam ter lido “não existe” antes de uma delas confirmar.

Wallet, `WagerTransaction`, ledger, inbox e outbox usam o mesmo callback `transactional`. Se qualquer etapa lançar erro, o PostgreSQL desfaz tudo. Não existe situação válida em que o saldo foi salvo sem ledger ou o dinheiro foi confirmado sem outbox.

## 18. Falhas previstas durante o funcionamento

### Payload HTTP inválido

O `ValidationPipe` rejeita formato inválido antes do serviço. Ausência de `Idempotency-Key` gera `InvalidRequestError`. A resposta é 400.

`OPENING` nunca é aceito externamente. Como o README torna `referenceExternalTransactionId` obrigatório para `REFUND` e `ROLLBACK`, a ausência desse campo também é erro de contrato: responde 400 no HTTP e é classificada como mensagem permanente para DLQ no SQS, sem persistir uma transação financeira.

### Recurso inexistente

`NotFoundError` é usado quando wallet ou transação não existe. A resposta é 404.

### Conflito

`ConflictError` cobre unicidade; `IdempotencyConflictError` cobre chave reutilizada com conteúdo diferente. A resposta é 409.

### Rejeição de negócio

Saldo insuficiente, moeda divergente, referência incompatível, valor divergente e reversão duplicada deixam uma transação auditável como `REJECTED`. A API responde 422 e a outbox recebe `WagerTransactionRejected`.

Por decisão funcional do projeto, entradas externas `BET`, `WIN`, `REFUND` e `ROLLBACK` com `0.00` também são rejeitadas com `INVALID_PAYLOAD`, sem lançamento financeiro. `LOSS` aceita zero porque representa o encerramento sem prêmio e não altera saldo. Parâmetros UUID, `limit` entre 1 e 100 e o cursor do ledger são validados antes da consulta; formato inválido responde 400.

### Referência ausente

Não é erro imediato. A API responde 202, grava `PENDING_REFERENCE` e deixa o worker tentar novamente. Depois de oito tentativas vira rejeição definitiva.

### PostgreSQL ou SQS temporariamente indisponível

No HTTP, códigos conhecidos de conexão são convertidos para 503. Na entrada SQS, erros que não são permanentes alteram a visibilidade para retry. Na outbox, falha de publicação agenda nova tentativa sem perder o evento.

### Mensagem SQS permanente

JSON malformado ou envelope inválido é enviado à DLQ. Uma falha de negócio válida recebe ACK sem DLQ; uma falha transitória recebe retry e somente vai à DLQ após o limite. A mensagem original só recebe ack depois que uma cópia necessária para a DLQ funciona.

### Processo encerrado

O consumidor para de buscar mensagens e espera o loop em andamento. Se morrer antes do ack, o SQS entrega novamente e o inbox evita duplicação. Se um publisher morrer com eventos em claim, o lease expira.

## 19. Falhas encontradas durante a implementação e como foram resolvidas

Esta seção registra problemas que realmente apareceram enquanto o projeto era construído e revisado.

### Bun não estava instalado

O runtime obrigatório não estava disponível no ambiente. Ele foi instalado para permitir dependências, build e testes. Depois disso, os comandos passaram a usar o executável do Bun.

### Os primeiros testes atingiriam dados de desenvolvimento

A execução inicial dos testes de integração tentaria truncar o banco principal e limpar as filas principais. Isso era arriscado e foi bloqueado pelo controle de segurança. A solução foi criar o banco isolado `wagering_test` e filas terminadas em `-test.fifo`. Os testes agora só limpam recursos próprios.

### Faltavam cenários distribuídos obrigatórios

A revisão encontrou ausência de testes reais para 50 duplicatas, três instâncias, concorrência de saldo, crash antes do ack, publishers concorrentes, referências fora de ordem e DLQ. `tests/integration/system.test.ts` usa PostgreSQL e LocalStack reais, inicia três processos HTTP e inicia um processo consumidor separado que encerra depois do commit e antes do ACK.

### Eventos não seguiam uma abstração única

Os eventos precisavam ter uma classe abstrata e subclasses concretas. Foi criado `IntegrationEvent` com envelope comum, e cada evento recebeu classe, tipo e versão próprios.

### Inbox e outbox estavam pouco representados no domínio

Foram criados `InboxMessage` e `OutboxMessage` com factories, reidratação e transições explícitas. Isso retirou decisões de estado de objetos soltos.

### Records de persistência vazavam para a aplicação

Os serviços conheciam diretamente `EntityManager` e classes terminadas em `Record`. Isso invertia a direção arquitetural. A solução foi criar `PersistencePort`, implementar `MikroOrmPersistenceAdapter` e concentrar conversões nos mappers. Agora `application` e `domain` não importam records nem MikroORM.

### Claim da outbox não era seguro depois de liberar o lock SQL

Somente `SKIP LOCKED` dentro de uma transação curta não protege o registro durante a publicação externa. Foram adicionados `locked_by` e `locked_until`. O claim passou a gravar um lease e as atualizações só funcionam para o mesmo dono.

### Tratamento de DLQ estava incompleto

Foi implementado envio explícito para a fila morta, separação entre falha permanente e transitória, limite de cinco recebimentos, backoff de visibilidade e ack somente depois da cópia para DLQ.

### Teste de atomicidade usou a API errada da transação

O teste tentou chamar `execute` em um objeto transacional do Knex cuja API tipada oferece `raw`. O runtime chegou a testar parte do cenário, mas build e lint detectaram o erro de tipo. As operações do teste foram trocadas para `transaction.raw`, mantendo todas dentro da mesma transação real.

### O script de start apontava para o arquivo errado

O TypeScript gera `dist/src/main.js`, mas `package.json` apontava para `dist/main.js`. O smoke test falhou com “Module not found”. O script foi corrigido para `bun dist/src/main.js`.

### Schedulers geravam `ValidationError`

Ao rodar a aplicação completa, os métodos agendados usavam o EntityManager global fora de um contexto de request. MikroORM bloqueou isso com `ValidationError`. Os workers passaram a criar `RequestContext` em cada ciclo e ganharam uma flag `ticking` para impedir sobreposição do mesmo intervalo.

### Leituras diretas falharam fora de uma request Nest

Depois da criação da porta, o teste de reconciliação chamou o adaptador diretamente e encontrou a mesma proteção de contexto do MikroORM. Os métodos de leitura passaram a usar `EntityManager.fork`, criando um contexto isolado próprio.

### Replay entre HTTP e SQS não registrava o inbox do novo canal

A transação financeira já era idempotente, mas uma operação criada primeiro por HTTP e repetida pela fila retornava antes de persistir o inbox. `recordReplayInbox` foi criado para registrar ou validar a mensagem SQS dentro do mesmo commit, mesmo quando o efeito financeiro já existe.

### Reconciliação confiava no último saldo do ledger

Usar apenas o último `balanceAfter` não era uma reconstrução independente. A reconciliação passou a começar em zero, somar todos os créditos e subtrair todos os débitos. Os testes também ganharam um `afterEach` que confirma essa igualdade para todas as wallets depois de cada cenário de integração.

### Logs guardavam contexto dentro de uma string

Os logs eram JSON, mas o conteúdo financeiro-operacional aparecia como outra string JSON dentro de `message`. `JsonLogger` foi ajustado para colocar `correlationId`, `transactionId`, `walletId`, `providerId` e demais campos no nível principal, facilitando busca e métricas.

## 20. Observabilidade

`JsonLogger` escreve JSON estruturado. Logs de transação contêm IDs e estado, mas não o payload financeiro completo.

`MetricsService` oferece:

- `wager_transactions_total`: contador por status;
- `wager_duplicates_total`: quantidade de replays detectados;
- `wager_retries_total`: retries por subsistema;
- `wager_dlq_messages_total`: mensagens enviadas à DLQ;
- `wager_lock_conflicts_total`: conflitos ou deadlocks reconhecidos;
- `wager_outbox_lag_seconds`: idade do evento pendente mais antigo;
- `wager_processing_duration_seconds`: histograma de duração HTTP/SQS;
- `wager_reconciliation_divergences_total`: divergências financeiras encontradas.

Counter significa contador acumulativo. Gauge significa valor que pode subir ou descer. Histogram significa distribuição em faixas, útil para analisar latência.

## 21. Autenticação

`NoOpAuthGuard` significa guard sem operação. Seu método `canActivate`, que significa “pode ativar a rota?”, devolve verdadeiro. Isso foi uma decisão permitida pelo desafio para priorizar correção financeira.

`ProviderIdentityPort` documenta o ponto futuro de integração. Em uma versão com autenticação real, um guard OIDC validaria o token em um provedor externo, como Keycloak, e compararia a identidade autenticada com `providerId`. OIDC significa OpenID Connect, protocolo padrão de identidade. Os endpoints de health continuariam públicos, e a fila continuaria sendo canal interno.

## 22. Arquivos do projeto e responsabilidade de cada um

- `src/main.ts`: inicia NestJS e configura logger, validação, filtro e shutdown.
- `src/app.module.ts`: conecta controllers, serviços, porta, adaptador, ORM, workers e métricas.
- `src/presentation/controllers.ts`: declara todas as rotas HTTP.
- `src/presentation/dto.ts`: define e valida os formatos HTTP.
- `src/presentation/http-exception.filter.ts`: transforma erros em status e corpo HTTP.
- `src/presentation/auth.guard.ts`: contém o guard no-op e a porta de identidade futura.
- `src/application/contracts.ts`: define comando de entrada e resultado da transação.
- `src/application/canonical-hash.ts`: cria JSON canônico e SHA-256.
- `src/application/persistence.port.ts`: contrato de persistência conhecido pela aplicação.
- `src/application/wagering.service.ts`: coordena todo o processamento financeiro.
- `src/application/wallet.service.ts`: cria, consulta, pagina e reconcilia wallets.
- `src/application/transaction-query.service.ts`: monta respostas de consulta sem expor records.
- `src/domain/money.ts`: aritmética monetária exata.
- `src/domain/wallet.ts`: regras de saldo e versão.
- `src/domain/wager-transaction.ts`: tipos, estados, transições e direção financeira.
- `src/domain/ledger.ts`: lançamento imutável e validação aritmética.
- `src/domain/messages.ts`: modelos de inbox e outbox.
- `src/domain/integration-event.ts`: envelope e eventos concretos.
- `src/domain/errors.ts`: erros e códigos estáveis de falha.
- `src/infrastructure/database/entities.ts`: records do MikroORM.
- `src/infrastructure/database/mappers.ts`: conversão domínio/persistência.
- `src/infrastructure/database/persistence.adapter.ts`: implementação PostgreSQL da porta.
- `src/infrastructure/database/migrations/*.ts`: evolução reversível do schema.
- `src/infrastructure/database/migrate.ts`: executa migrations para cima ou para baixo.
- `src/infrastructure/messaging/sqs.service.ts`: cliente e operações SQS.
- `src/infrastructure/workers.ts`: consumidor, outbox e referência pendente.
- `src/observability.ts`: logger, métricas e endpoint Prometheus.
- `compose.yml`: containers, portas, health checks e volume.
- `docker/localstack/init-queues.sh`: criação das filas locais.
- `.env.example`: variáveis disponíveis e valores locais de exemplo.
- `mikro-orm.config.ts`: conexão, records e diretório das migrations.
- `tsconfig.json`: regras de compilação TypeScript.
- `package.json`: dependências e comandos do projeto.
- `bun.lock`: versões exatas resolvidas das dependências.
- `tests/unit`: testes isolados das regras de domínio.
- `tests/integration/system.test.ts`: testes reais de banco, SQS, concorrência e falhas.
- `ARCHITECTURE.md`: resumo formal das decisões arquiteturais.
- `README.md`: fonte de verdade do desafio e instruções de execução.

## 23. Comandos e o que cada um aciona

- `bun install`: Bun lê `package.json`, baixa dependências e atualiza `bun.lock`.
- `docker compose up -d --wait`: Docker Compose inicia PostgreSQL e LocalStack e aguarda os health checks.
- `bun run migration:up`: Bun executa `migrate.ts`, e MikroORM aplica migrations pendentes.
- `bun run migration:down`: reverte a migration mais recente.
- `bun run dev`: inicia `src/main.ts` com recarga automática quando o código muda.
- `bun run build`: TypeScript compila código e testes para `dist`.
- `bun run start`: Bun executa o artefato compilado `dist/src/main.js`.
- `bun run lint`: TypeScript verifica todos os tipos sem gerar arquivos.
- `bun test` ou `bun run test`: `bun:test` executa testes unitários e de integração.
- `bun run test:integration`: executa somente os testes com PostgreSQL e LocalStack.

## 24. Resumo mental em poucas linhas

Uma operação entra por HTTP ou SQS, vira `SubmitTransactionCommand` e chega a `WageringService.execute`. O serviço calcula o hash, verifica repetição, bloqueia a wallet, cria objetos de domínio e usa `PersistencePort`. O adaptador converte esses objetos em records e confirma transação, saldo, ledger, inbox e outbox juntos no PostgreSQL. Depois, `OutboxWorker` publica os eventos no SQS. Se algo repetir, o banco, a chave idempotente e o inbox impedem efeitos duplicados. Se algo falhar temporariamente, existem retries; se falhar definitivamente, existe rejeição auditável ou DLQ. A reconciliação recalcula o saldo inteiro a partir do ledger para provar que o saldo materializado continua correto.
