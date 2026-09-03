# AGENTS.md

## Objetivo

Implementar o desafio técnico descrito no `README.md` deste repositório.

O `README.md` é a fonte de verdade para todos os requisitos funcionais, técnicos e critérios de aceite do desafio.

Nada deve ser inventado, presumido ou adicionado sem necessidade.

---

## Regra principal: seguir o README

Antes de qualquer implementação:

1. Leia o `README.md` completamente, do início ao fim.
2. Extraia todos os requisitos explícitos.
3. Identifique restrições, critérios de aceite e opções tecnológicas permitidas.
4. Inspecione a estrutura atual do projeto.
5. Leia completamente as Skills relevantes em `.agents/skills/`.
6. Monte um plano curto de implementação.
7. Somente depois comece a modificar o projeto.

Ao terminar a implementação, leia o `README.md` novamente e valide requisito por requisito.

### Prioridade de decisão

Quando houver conflito ou dúvida, siga esta ordem:

1. Requisitos explícitos do `README.md`.
2. Critérios de aceite do desafio.
3. Restrições já existentes no projeto.
4. Instruções deste `AGENTS.md`.
5. Skills em `.agents/skills/`.
6. A solução tecnicamente mais simples e fácil de manter.

---

## Proibição de inventar requisitos

Não implemente funcionalidades que não estejam pedidas.

Não crie regras de negócio, validações, endpoints, campos, fluxos, abstrações ou comportamentos por suposição.

Não altere contratos públicos definidos pelo desafio sem autorização.

Não modifique testes fornecidos pelo desafio, exceto se o próprio README autorizar explicitamente.

Não substitua código existente sem antes entender sua finalidade.

---

## Regra de incerteza

Nenhuma decisão funcional deve ser implementada com dúvida.

Se um requisito do `README.md` estiver ambíguo, incompleto ou permitir interpretações que produzam comportamentos diferentes:

1. interrompa somente a parte afetada;
2. explique claramente a dúvida no chat;
3. apresente, quando útil, as interpretações possíveis;
4. aguarde orientação do usuário antes de implementar aquela decisão.

Não escolha silenciosamente uma interpretação para requisitos funcionais ambíguos.

Para decisões puramente técnicas, sem impacto no comportamento solicitado, escolha a alternativa mais simples, estável e compatível com o README.

---

## Escolha entre ferramentas permitidas

Quando o `README.md` oferecer explicitamente duas ou mais ferramentas, bibliotecas, ORMs, frameworks ou abordagens como alternativas válidas:

1. compare rapidamente as opções;
2. considere simplicidade de implementação;
3. considere quantidade de configuração necessária;
4. considere compatibilidade com o restante do desafio;
5. considere facilidade de leitura e manutenção;
6. escolha autonomamente a alternativa mais simples que satisfaça integralmente o desafio.

Não escolha uma ferramenta apenas por ser mais sofisticada, moderna ou popular.

Se duas opções forem equivalentes, prefira a que introduzir menos dependências, configuração e código.

---

## Stack principal

O projeto deve utilizar Node.js com TypeScript.

Siga a Skill:

`.agents/skills/node-typescript/SKILL.md`

Crie apenas a configuração necessária para executar, desenvolver, testar e compilar o projeto conforme o desafio.

Evite configurações avançadas de TypeScript sem necessidade concreta.

---

## Instalação de ferramentas e dependências

O Codex possui autonomia para utilizar o terminal e instalar dependências necessárias ao desafio.

Pode:

- inicializar o projeto Node quando necessário;
- instalar dependências e dependências de desenvolvimento;
- criar ou atualizar arquivos de configuração;
- executar scripts;
- criar e iniciar containers;
- executar migrations quando a solução escolhida exigir;
- executar build, testes, lint e demais verificações configuradas.

Antes de instalar algo, confirme que a dependência possui finalidade real no desafio.

Não instale bibliotecas para funcionalidades que podem ser resolvidas de forma simples com os recursos já disponíveis.

Se uma ferramenta necessária não puder ser instalada ou configurada autonomamente pelo terminal, informe no chat:

- qual ferramenta é necessária;
- por que ela é necessária;
- o que impediu a instalação;
- qual ação manual o usuário precisa realizar.

Não substitua silenciosamente a ferramenta por outra que altere a solução esperada.

---

## Arquitetura

Siga:

`.agents/skills/architecture/SKILL.md`

Objetivo arquitetural:

- organização em camadas;
- MVC na camada de entrada HTTP quando aplicável;
- princípios de arquitetura hexagonal para manter domínio e regras de negócio desacoplados;
- dependências de código apontando para o núcleo da aplicação;
- modelos separados para contratos HTTP, domínio e persistência;
- DTOs e mappers explícitos nas fronteiras entre camadas;
- baixo acoplamento;
- alta coesão;
- responsabilidades claras.

A arquitetura deve permanecer proporcional ao desafio.

Não faça overengineering.

---

## Domínio e qualidade de código

Siga:

`.agents/skills/domain-code-quality/SKILL.md`

Utilize conceitos de:

- Domain-Driven Design quando houver domínio de negócio relevante;
- SOLID quando melhorarem clareza, desacoplamento ou testabilidade;
- Clean Code;
- inversão de dependência quando necessária;
- separação de responsabilidades.

Esses conceitos são ferramentas, não objetivos.

Não crie classes, interfaces, factories, services, use cases, adapters ou abstrações sem uma responsabilidade concreta.

Não reutilize entidades ou objetos de domínio como DTOs da API ou como entidades/modelos de persistência. Não exponha entidades do banco diretamente nas respostas HTTP. Faça as conversões entre representações por meio de mappers explícitos nas fronteiras apropriadas.

---

## Banco de dados

O PostgreSQL solicitado pelo desafio deve ser executado localmente através de Docker Compose, salvo se o `README.md` exigir explicitamente outra forma.

Siga:

`.agents/skills/database-postgresql/SKILL.md`

Não dependa de uma instalação local manual do PostgreSQL quando um container puder atender ao desafio.

---

## Segurança de tipos

TypeScript deve ser utilizado de forma efetiva.

Evite:

- `any`;
- casts desnecessários;
- tipos genéricos vagos;
- objetos sem contrato quando um tipo ou interface clara for apropriado;
- `@ts-ignore` ou equivalentes para esconder erros.

Prefira tipos explícitos nas fronteiras da aplicação e inferência quando ela continuar clara e segura.

Não crie tipagem excessivamente complexa apenas para demonstrar conhecimento.

---

## Idioma e nomenclatura

As instruções do projeto, incluindo `AGENTS.md` e `SKILL.md`, podem permanecer em português.

Salvo convenção contrária definida pelo `README.md` ou pelo código existente, utilize inglês para nomes de classes, interfaces, funções, métodos, variáveis, enums e arquivos de código.

Mantenha uma única convenção de nomenclatura em todo o projeto.

---

## Código existente

Considere código existente como intencional até entender o contrário.

Antes de substituir uma implementação:

1. entenda sua finalidade;
2. confira sua relação com o README;
3. identifique se realmente precisa ser alterada;
4. prefira mudanças incrementais quando forem suficientes.

Não reescreva código funcional apenas porque outra arquitetura também seria válida.

---

## Simplicidade

Quando múltiplas soluções forem válidas, prefira a solução mais simples que satisfaça integralmente o desafio.

Não otimize para parecer sofisticado.

Otimize para:

- correção;
- clareza;
- legibilidade;
- manutenção;
- testabilidade;
- facilidade de revisão por outro desenvolvedor.

---

## Testes

Siga:

`.agents/skills/testing/SKILL.md`

Teste regras de negócio e comportamentos relevantes.

Priorize testes que comprovem requisitos do README e casos de borda relevantes.

Não escreva testes apenas para aumentar cobertura.

---

## Critérios antes de considerar o desafio concluído

Antes de declarar conclusão:

1. releia todo o `README.md`;
2. valide cada requisito explícito;
3. compile o TypeScript;
4. execute todos os testes;
5. execute lint ou análise estática se estiverem configurados;
6. confirme que o PostgreSQL via Docker Compose inicia corretamente;
7. confirme que a aplicação consegue se conectar ao banco;
8. revise arquivos de configuração;
9. revise o `git diff`;
10. remova alterações acidentais, código morto e imports não utilizados;
11. confirme que nenhuma funcionalidade foi inventada;
12. execute a revisão definida em `.agents/skills/challenge-review/SKILL.md`.

Ao finalizar, informe no chat:

- o que foi implementado;
- decisões técnicas relevantes;
- qual opção foi escolhida quando o README ofereceu alternativas e por quê;
- testes e verificações executados;
- qualquer ponto que ainda dependa de ação manual.
- crie um arquivo, COMENTARIOS.md, explicando todo o desafio, as classes e metodos, o porque de tudo, e o que cada coisa faz, a função de tudo que estiver no desafio.
