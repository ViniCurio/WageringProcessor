---
name: testing
description: Use ao planejar, implementar ou executar testes automatizados e ao validar os comportamentos e casos de borda exigidos pelo README.
---

# Skill: Testes

## Objetivo

Comprovar o comportamento exigido pelo README sem criar uma suíte inflada ou artificial.

## Prioridade

Teste primeiro:

1. regras de negócio;
2. critérios de aceite;
3. validações relevantes;
4. casos de borda explicitamente citados ou naturalmente importantes;
5. integração com infraestrutura quando necessária ao desafio.

## Estilo

Prefira testes orientados a comportamento.

Os nomes devem explicar o que está sendo garantido.

Evite testar detalhes internos de implementação quando o comportamento público for suficiente.

## Mocks

Mocke dependências externas quando isso tornar o teste mais rápido e focado.

Não mocke regras de domínio apenas para fazer o teste passar.

Evite mocks excessivos.

## Cobertura

Cobertura é consequência de bons testes, não o objetivo principal.

Não escreva testes sem valor apenas para elevar porcentagem.

## Ferramenta

Se o README indicar ferramenta de testes, use-a.

Se oferecer alternativas, escolha a opção compatível mais simples.

Se o README não indicar ferramenta, use a mais simples compatível com o desafio, mas explique o porquê da escolha no chat e peça autorização para prosseguir.

## Antes de concluir

- todos os testes devem passar;
- testes fornecidos pelo desafio devem continuar intactos salvo autorização explícita;
- falhas devem ser corrigidas pela causa, não mascaradas.
