# STIMMA OS — especificação do produto

## Missão

Camada de inteligência e automação acima do Simples Dental, para o gestor da operação da
Dra. Larissa Andrade (Clínica Stimma). Não é um dashboard, CRM ou relatório financeiro — é um
sistema que observa a operação continuamente e transforma dado em ação:

`DADO → EVENTO → INTERPRETAÇÃO → RISCO/OPORTUNIDADE → PRIORIDADE → AÇÃO → RESPONSÁVEL → PRAZO
→ ACOMPANHAMENTO → CONCLUSÃO`

## Princípio central

**Todo paciente ativo precisa ter um próximo passo definido** (`next_action != null`). Paciente
importante sem próximo passo é uma exceção que o sistema deve mostrar automaticamente.

## North Star

**% de pacientes ativos com próximo passo definido**, aproximando-se de 100%.

Métrica secundária: **valor recuperado pelo STIMMA OS** — soma de oportunidades identificadas,
trabalhadas e convertidas graças ao sistema (nunca confundir com faturamento total).

## Escopo de negócio

- Foco inicial: Dra. Larissa Andrade — Harmonização Orofacial, Odontologia, estética facial.
- Posicionamento: premium, natural, relacionamento e acompanhamento de longo prazo — não venda
  agressiva. Faturamento cresce por melhor acompanhamento, menos oportunidades perdidas, melhor
  organização de agenda, cobrança e fidelização.
- Equipe inicial (roles configuráveis, nunca hardcoded por pessoa): Álvaro (gestor, admin),
  Dra. Larissa (profissional clínica), Gabi (recepção/agendamento/comercial), Dine (ASB/apoio
  clínico), Jaynnes (SPA).
- Parâmetros de negócio iniciais (todos editáveis em Configurações): avaliação R$ 250 (condição
  excepcional R$ 100), meta ≈ 5 planos novos/mês, meta de aquisição ≈ 1 paciente novo por dia
  útil, ticket anual de referência ≈ R$ 15.000.

## Experiência principal

Ao abrir o sistema, em até 10 segundos o gestor deve entender: o que aconteceu, o que está
errado, onde há oportunidade, o que a equipe precisa fazer, o que ele precisa decidir.

## Estrutura de telas (visão alvo — construída incrementalmente)

Desktop: `Hoje · Agenda · Pacientes · Oportunidades · Financeiro · Tarefas · Equipe ·
Relatórios · Atividade` + `STIMMA AI · Automações · Integrações · Configurações`.

Mobile/PWA: `Hoje · Alertas · Aprovações · Tarefas · AI`.

## Matriz de autonomia (como o sistema decide sozinho)

- **Nível A — automático**: ler, sincronizar, classificar, gerar alerta/tarefa/oportunidade,
  gerar briefing/relatório, detectar horário livre.
- **Nível B — automático + log**: atualizar status interno, concluir tarefa do sistema quando a
  solução for detectada, reorganizar prioridades.
- **Nível C — aprovação humana**: lançar pagamento real, alterar dado financeiro relevante,
  enviar comunicação sensível ao paciente, mudança relevante no Simples Dental. Uma única tela
  de aprovação, uma única confirmação.
- **Nível D — somente humano**: indicação clínica, diagnóstico, prescrição, conduta clínica,
  exclusão financeira crítica, ações irreversíveis importantes.

## Definition of done (por funcionalidade)

Código implementado + banco aplicado + tipos corretos + segurança verificada + estados de erro
tratados + testes executados + interface testada no navegador + comportamento validado +
documentação atualizada + commit realizado. "Compilou" não é "pronto".

## Fora de escopo (por ora)

Reconstruir Simples Dental; diagnóstico ou indicação clínica automatizada; qualquer ação
financeira irreversível sem aprovação; SQL arbitrário exposto ao LLM em produção.
