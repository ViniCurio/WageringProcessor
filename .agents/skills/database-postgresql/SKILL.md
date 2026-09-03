---
name: database-postgresql
description: Use ao configurar PostgreSQL, Docker Compose, variáveis de ambiente, migrations e integração da aplicação com a persistência.
---

# Skill: PostgreSQL com Docker Compose

## Objetivo

Executar o PostgreSQL necessário ao desafio através de Docker Compose, de forma simples e reproduzível.

## Regra principal

Salvo exigência contrária explícita no README, não dependa de instalação manual local do PostgreSQL.

Use um container PostgreSQL definido em `docker-compose.yml` ou `compose.yml`.

## Compose

Configure somente o necessário:

- imagem oficial do PostgreSQL;
- porta, se acesso pelo host for necessário;
- nome do banco;
- usuário;
- senha de desenvolvimento;
- volume persistente quando útil;
- healthcheck quando trouxer benefício real ao fluxo de inicialização.

Evite serviços adicionais sem necessidade.

## Configuração da aplicação

A conexão da aplicação deve utilizar variáveis de ambiente.

Forneça `.env.example` sem credenciais sensíveis reais.

Se o README especificar nomes de variáveis, connection string ou parâmetros, siga-os exatamente.

## ORM / Query Builder / Driver

Se o README determinar uma tecnologia, utilize-a.

Se oferecer alternativas válidas, escolha a solução mais simples considerando:

- setup;
- migrations;
- tipagem;
- quantidade de boilerplate;
- facilidade de compreender a solução;
- compatibilidade com os requisitos.

Não troque a tecnologia escolhida no meio da implementação sem motivo concreto.

## Migrations

Crie migrations somente se o desafio ou a ferramenta escolhida exigir ou se forem necessárias para tornar o banco reproduzível.

Não crie infraestrutura de migrations complexa para um esquema trivial se a alternativa escolhida não exigir isso.

## Validação

Antes de concluir:

1. suba o PostgreSQL pelo Docker Compose;
2. confirme que o container está saudável ou operacional;
3. confirme a conexão da aplicação;
4. execute migrations/setup quando aplicável;
5. confirme que operações exigidas pelo desafio funcionam contra o PostgreSQL.
