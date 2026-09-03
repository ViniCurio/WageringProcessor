---
name: architecture
description: Use ao planejar ou implementar a arquitetura do desafio, especialmente camadas, MVC, princípios hexagonais, DTOs, mappers e separação entre domínio e infraestrutura.
---

# Skill: Arquitetura

## Objetivo

Organizar a aplicação de forma clara, desacoplada e testável, combinando arquitetura em camadas, MVC e princípios de arquitetura hexagonal sem overengineering.

## Diretriz geral

Use uma arquitetura em camadas.

Quando houver uma API HTTP, utilize MVC principalmente na camada de entrada:

- Controller: recebe a requisição e traduz entrada/saída;
- Model/Domain: representa conceitos e regras de negócio;
- a camada de apresentação não deve concentrar regras de negócio.

Use princípios hexagonais para proteger o núcleo da aplicação:

- domínio e regras de negócio não devem depender diretamente de framework HTTP;
- domínio não deve depender diretamente de PostgreSQL, ORM ou driver;
- integrações externas ficam nas bordas;
- contratos/ports devem existir quando forem realmente necessários para desacoplar uma dependência externa.

## Dependências

As dependências de código devem apontar para o núcleo da aplicação. As camadas internas não podem depender de controllers, frameworks HTTP, ORM, PostgreSQL, drivers ou outros detalhes externos. As camadas externas podem conhecer e implementar contratos definidos pelo núcleo.

Uma organização possível, quando proporcional ao desafio:

`presentation/controller -> application/service/use-case -> domain -> port`

e:

`infrastructure/adapter -> port`

A nomenclatura exata deve se adaptar ao projeto e ao README.

Não crie camadas vazias apenas para obedecer a um desenho arquitetural.

## Modelos, DTOs e mappers

Não utilize o mesmo objeto para representar simultaneamente:

- o contrato HTTP de entrada ou saída;
- um conceito, entidade ou value object do domínio;
- uma entidade ou modelo de persistência do ORM ou banco de dados.

Cada representação deve pertencer à sua camada e refletir sua responsabilidade:

- DTOs de request e response pertencem à borda de entrada/saída e definem o contrato da API;
- entidades, value objects e tipos de domínio representam conceitos, comportamentos e regras de negócio;
- entidades ou modelos de persistência pertencem à infraestrutura e refletem as necessidades do banco ou ORM.

Use mappers explícitos nas fronteiras para converter:

- DTO de entrada em comando, dados de aplicação ou objeto de domínio;
- domínio em DTO de resposta;
- domínio em entidade ou modelo de persistência;
- entidade ou modelo de persistência em domínio.

Não exponha diretamente entidades de persistência na API. Não faça o domínio importar DTOs, modelos do ORM ou tipos específicos do framework.

Mappers devem apenas traduzir representações. Não coloque neles regras de negócio, acesso ao banco, chamadas externas ou decisões de fluxo.

Evite cadeias de conversão e DTOs duplicados sem responsabilidade distinta. A separação obrigatória existe entre fronteiras com responsabilidades diferentes; ela não justifica criar uma nova classe para cada método ou camada.

## Controllers

Controllers devem:

- receber e interpretar a entrada HTTP;
- delegar trabalho;
- transformar resultados em resposta HTTP;
- manter lógica de transporte separada da regra de negócio.

Evite regras de negócio complexas dentro de controllers.

## Application / Services / Use Cases

Use uma camada de aplicação quando ela ajudar a coordenar regras, persistência ou integrações.

Não crie simultaneamente `Service` e `UseCase` para a mesma responsabilidade sem motivo concreto.

Escolha a abstração mais simples e consistente.

## Domain

O domínio deve conter comportamentos e invariantes reais do problema quando eles existirem.

Não transforme DTOs simples em entidades ricas artificialmente.

## Repositories / Ports

Crie interfaces para persistência ou serviços externos quando isso:

- desacoplar regra de negócio de infraestrutura;
- facilitar testes;
- evitar dependência direta do domínio em tecnologia externa.

Não crie uma interface apenas porque “arquitetura hexagonal usa interfaces”.

## Infrastructure / Adapters

Banco de dados, ORM, drivers, frameworks e integrações externas pertencem à infraestrutura.

A infraestrutura pode conhecer contratos do núcleo; o núcleo não deve conhecer detalhes da infraestrutura.

## Regra de proporcionalidade

O desafio técnico deve demonstrar julgamento de engenharia, não quantidade de padrões conhecidos.

Evite, salvo necessidade clara do README:

- CQRS;
- Event Sourcing;
- buses internos;
- factories sem lógica real;
- abstrações duplicadas;
- múltiplos níveis de DTO sem responsabilidade distinta;
- adapters triviais que apenas repassam argumentos;
- camadas que não adicionam responsabilidade.

Se uma camada não tiver responsabilidade real, não a crie.
