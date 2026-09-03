---
name: challenge-review
description: Use obrigatoriamente na revisão final do desafio para conferir o README requisito por requisito, arquitetura, testes, banco, diff e critérios de conclusão.
---

# Skill: Revisão Final do Desafio

## Objetivo

Atuar como etapa final de revisão antes de declarar o desafio concluído.

## Fonte de verdade

Leia novamente o `README.md` completo.

Transforme cada requisito explícito em um checklist interno.

Classifique cada item como:

- PASS;
- FAIL;
- UNCERTAIN.

Nenhum item `FAIL` pode permanecer antes da conclusão.

Qualquer item `UNCERTAIN` relacionado a requisito funcional deve ser levado ao usuário no chat antes de uma decisão de implementação.

## Revisão técnica

Verifique:

- requisitos esquecidos;
- comportamentos inventados;
- endpoints ou contratos divergentes;
- validações não solicitadas que alterem comportamento;
- dependências desnecessárias;
- imports não utilizados;
- código morto;
- nomes inconsistentes;
- duplicação evitável;
- acoplamento desnecessário;
- abstrações sem responsabilidade;
- complexidade excessiva;
- uso inadequado de `any`;
- casts inseguros;
- configuração TypeScript excessiva;
- arquivos acidentais;
- segredos ou credenciais commitados.

## Arquitetura

Confirme que:

- controllers não concentram regra de negócio relevante;
- domínio não depende diretamente de detalhes HTTP;
- persistência está separada do núcleo;
- entidades de domínio não são reutilizadas como DTOs da API;
- entidades ou modelos de persistência não vazam para controllers ou respostas HTTP;
- existem mappers explícitos entre API, domínio e persistência;
- mappers não contêm regras de negócio, acesso ao banco ou decisões de fluxo;
- abstrações existentes têm responsabilidade concreta;
- MVC, camadas e princípios hexagonais foram usados de forma proporcional.

## Banco

Confirme que:

- PostgreSQL inicia via Docker Compose;
- a aplicação conecta corretamente;
- setup/migrations necessários funcionam;
- variáveis de ambiente estão documentadas sem expor segredo real.

## Execução

Execute, conforme disponível:

- build;
- testes;
- lint;
- análise estática;
- aplicação local;
- fluxo principal do desafio.

## Git diff

Revise o diff final.

Remova:

- arquivos temporários;
- logs de debug;
- comentários esquecidos;
- código comentado;
- alterações não relacionadas ao desafio.

## Relatório final

Ao finalizar, informe no chat de forma objetiva:

- requisitos implementados;
- principais decisões;
- ferramentas escolhidas entre alternativas do README e a justificativa;
- testes e comandos de verificação executados;
- limitações ou ações manuais restantes.

Não declare conclusão se houver requisito funcional em dúvida.
