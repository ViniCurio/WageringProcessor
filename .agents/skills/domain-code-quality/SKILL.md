---
name: domain-code-quality
description: Use ao implementar ou revisar regras de negócio, DDD, SOLID, Clean Code, invariantes, tipagem e desacoplamento do domínio.
---

# Skill: Domínio e Qualidade de Código

## Objetivo

Produzir código moderno, legível, desacoplado e fácil de testar, aplicando DDD, SOLID e Clean Code apenas onde agregarem valor real.

## Domain-Driven Design

Use conceitos de DDD quando houver regras e linguagem de negócio relevantes.

Priorize:

- linguagem ubíqua coerente com o README;
- nomes que reflitam o domínio;
- regras próximas dos conceitos aos quais pertencem;
- invariantes protegidas;
- separação entre domínio e detalhes técnicos.

O modelo de domínio deve permanecer independente de contratos HTTP e de modelos de persistência. Preserve essa independência com DTOs nas bordas e mappers explícitos entre apresentação, aplicação, domínio e infraestrutura.

Conversões não devem enfraquecer invariantes. A criação ou reconstrução de objetos de domínio deve continuar passando pelos mecanismos do próprio domínio responsáveis por garantir estados válidos.

Não force DDD em partes puramente técnicas ou CRUD simples sem regra de negócio.

## SOLID

### Single Responsibility

Cada módulo, classe ou função deve possuir uma responsabilidade clara.

### Open/Closed

Não crie extensibilidade hipotética.

Aplique quando houver uma variação real prevista pelo desafio.

### Liskov Substitution

Implementações de contratos devem preservar o comportamento esperado.

### Interface Segregation

Prefira contratos pequenos e específicos quando interfaces forem necessárias.

### Dependency Inversion

Regras de negócio não devem depender diretamente de detalhes externos quando um contrato simples puder desacoplar a solução.

## Clean Code

Prefira:

- nomes claros;
- funções pequenas quando isso melhorar compreensão;
- fluxo de controle simples;
- responsabilidades explícitas;
- tratamento de erro coerente;
- código autoexplicativo.

Evite:

- comentários em geral no código;
- funções gigantes;
- nomes genéricos;
- duplicação desnecessária;
- flags e condicionais difíceis de compreender;
- abstrações prematuras;
- código morto.

## Tipagem

Utilize TypeScript para tornar contratos claros.

Evite `any`.

Use `unknown` quando o valor realmente for desconhecido e faça narrowing adequado.

Não esconda erros do compilador com casts ou diretivas de supressão sem motivo excepcional.

## Erros

Diferencie, quando fizer sentido:

- erros de validação;
- erros de domínio;
- erros de recurso inexistente;
- falhas de infraestrutura.

Não exponha detalhes internos ou stack traces como resposta pública da API.

A forma exata das respostas deve respeitar o README.

## Regra contra overengineering

Antes de criar uma nova abstração, pergunte:

“Existe uma responsabilidade concreta que justifica isto agora?”

Se a resposta for não, não crie.

A solução deve ser fácil de explicar em uma revisão técnica.
