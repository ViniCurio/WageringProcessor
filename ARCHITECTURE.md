# Arquitetura

A aplicação usa uma arquitetura pequena, em camadas e com princípios de arquitetura hexagonal: os adaptadores HTTP e SQS traduzem as entradas para o mesmo comando de aplicação; os serviços de aplicação coordenam os objetos de domínio por meio da `PersistencePort`; as classes de domínio e os serviços de aplicação não importam o ORM nem os records de persistência; o adaptador MikroORM, os records e o SQS ficam na infraestrutura. Mappers explícitos traduzem o estado do domínio somente nessa fronteira com o adaptador.

## Correção financeira e concorrência

`Money` encapsula a `decimal.js`, aceita textos com exatamente duas casas decimais e é persistido como `numeric(20,2)`. Uma transação bloqueia somente a linha da wallet correspondente usando `SELECT FOR UPDATE`. Wallet, transação, ledger, inbox e outbox são alterados dentro da mesma transação PostgreSQL. As restrições do banco impedem saldos negativos e aritmética inconsistente no ledger. As linhas do ledger são imutáveis por meio de um gatilho que impede atualização e exclusão.

MikroORM foi escolhido em vez de TypeORM porque é a opção preferencial e expõe diretamente Unit of Work, transações e bloqueios pessimistas. A abordagem prioriza correção e fronteiras transacionais fáceis de entender em vez de uma vazão maior para uma wallet muito disputada.

## Idempotência e entrega

A chave de idempotência HTTP é única no PostgreSQL. O SHA-256 é calculado sobre um JSON canônico que contém somente os campos de negócio. A transação armazena o saldo resultante para que um replay devolva exatamente a observação original. A entrega por SQS usa adicionalmente um inbox com unicidade por consumidor e identificador da mensagem. O comportamento FIFO do broker é apenas uma otimização.

Publicadores da outbox fazem a reivindicação atômica de lotes usando `FOR UPDATE SKIP LOCKED` junto de uma concessão temporária persistida de 30 segundos (`locked_by` e `locked_until`). A publicação acontece fora da transação curta usada para a reivindicação; as atualizações de sucesso e nova tentativa exigem que o worker continue sendo o dono da mesma concessão. Assim, um publicador que morreu não consegue prender o trabalho indefinidamente. Os eventos são enviados para `wager-events.fifo`; os consumidores devem deduplicar pelo identificador do evento, porque uma queda depois do envio e antes da marcação como publicado pode causar entrega duplicada. Referências pendentes usam oito tentativas com espera exponencial limitada a cinco minutos. O SQS permite cinco recebimentos antes da DLQ, enquanto mensagens malformadas ou permanentemente inválidas são copiadas explicitamente para a DLQ e depois confirmadas na fila original.

Todos os payloads de evento são originados por subclasses concretas de `IntegrationEvent`; o `eventType` e a `version` pertencem a cada classe de evento. `InboxMessage` e `OutboxMessage` controlam suas próprias transições de estado, enquanto os mappers explícitos de persistência reidratam os objetos de domínio sem revalidar transições históricas.

## Autenticação e operação

A autenticação é intencionalmente sem operação porque ela não pontua no desafio e a prioridade é a correção financeira. `NoOpAuthGuard` e `ProviderIdentityPort` são os pontos explícitos de extensão para uma futura proteção OIDC apoiada por Keycloak. Os endpoints de saúde permanecem públicos e o SQS é tratado como um canal interno. Os logs são JSON e incluem identificadores de correlação, mensagem, transação, wallet e provedor sem registrar o conteúdo financeiro completo. As métricas disponíveis em `/metrics` cobrem estado, duplicatas, novas tentativas, DLQ, conflitos de bloqueio, atraso da outbox, latência de processamento e divergências de reconciliação.

## Classificação das mensagens SQS

Mensagens malformadas vão diretamente para a DLQ; erros de negócio válidos são terminais e recebem ACK; falhas transitórias usam backoff e só vão à DLQ depois de cinco recebimentos. Operações externas `BET`, `WIN`, `REFUND` e `ROLLBACK` com valor `0.00` são rejeitadas como `INVALID_PAYLOAD`; `LOSS` continua aceitando zero porque não produz movimento financeiro.

## Verificação

Os testes de integração criam um banco isolado chamado `wagering_test` e filas dedicadas terminadas em `-test.fifo`. Eles iniciam três processos HTTP reais, além de conexões ORM independentes, para exercitar bloqueios distribuídos, 50 submissões duplicadas concorrentes, disputas por uma wallet, nova entrega do SQS depois de um processo confirmar no banco e encerrar antes do ACK, concessões temporárias da outbox, recuperação após reinicialização, SQS/DLQ reais e migrations reversíveis sem apagar dados de desenvolvimento.

## Compromissos conhecidos

A implementação aceita BRL nas entradas, mas mantém o comportamento multi-moeda no domínio. O PostgreSQL é a fonte da verdade. LocalStack foi escolhido porque seu comportamento de SQS e suas ferramentas são familiares para quem revisa o projeto.
