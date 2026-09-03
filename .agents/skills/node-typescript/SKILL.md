---
name: node-typescript
description: Use ao inicializar, configurar, compilar ou executar o projeto Node.js com TypeScript e ao escolher configurações e dependências básicas da stack.
---

# Skill: Node.js e TypeScript

## Objetivo

Criar e configurar o ambiente Node.js + TypeScript necessário para o desafio com configuração simples, previsível e sem complexidade desnecessária.

## Inicialização

Se o projeto ainda não estiver inicializado:

- crie o `package.json`;
- instale TypeScript e dependências necessárias;
- configure scripts úteis para desenvolvimento, build e testes conforme o projeto exigir.

Antes de escolher npm, pnpm ou yarn:

1. respeite o que o README determinar;
2. se já houver lockfile, mantenha o gerenciador correspondente;
3. caso contrário, escolha a opção mais simples e convencional para o desafio.

## tsconfig

Crie um `tsconfig.json` enxuto.

Configure apenas opções necessárias para:

- versão de JavaScript alvo;
- sistema de módulos;
- resolução de módulos;
- diretório de entrada e saída quando necessário;
- interoperabilidade exigida pelas dependências;
- segurança de tipos adequada.

Prefira `strict: true`, salvo incompatibilidade concreta com o desafio ou starter code.

Não adicione aliases, project references, múltiplos tsconfigs, decorators, paths ou flags avançadas sem necessidade real.

## Estrutura

Organize `src` de acordo com a arquitetura definida para o projeto.

Não escolha uma estrutura excessivamente profunda.

A estrutura deve permitir localizar rapidamente:

- entrada HTTP;
- aplicação/regras de negócio;
- domínio;
- infraestrutura;
- configuração.

## Dependências

Instale somente dependências necessárias.

Não adicione bibliotecas para funcionalidades nativas simples do Node sem justificativa.

Quando o README oferecer alternativas de framework ou biblioteca, aplique a política do `AGENTS.md`: escolha a alternativa válida mais simples de implementar e manter.

## Scripts

Crie somente scripts úteis, por exemplo, quando aplicáveis:

- desenvolvimento;
- build;
- start;
- test;
- lint.

Os nomes devem seguir convenções simples.

## Ambiente

Segredos e credenciais não devem ser commitados.

Quando necessário, use variáveis de ambiente e forneça `.env.example` com nomes das variáveis, nunca valores secretos reais.

## Verificação

Antes de concluir:

- TypeScript deve compilar sem erros;
- scripts principais devem funcionar;
- não deve haver dependências não utilizadas;
- configurações devem continuar mínimas e compreensíveis.
