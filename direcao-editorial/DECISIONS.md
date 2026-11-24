# Decisões — Direção Editorial

## 2026-11-24 — Nomenclatura oficial: Método ERA
**Decisão (Álvaro):** o método oficial é **Método ERA**. "Método LA™" não é mais usado.
**Por quê:** o plano mestre apontava risco de misturar dois posicionamentos.
**Consequência:** toda a base, prompts e conteúdos usam "Método ERA". Qualquer material antigo
que cite LA™ deve ser sinalizado para revisão, nunca reaproveitado como está. O significado de
cada letra ainda precisa ser confirmado (ver P-01).

## 2026-11-24 — Projeto mora em `direcao-editorial/`
**Decisão (técnica, reversível):** pasta própria na raiz do repositório, separada do STIMMA OS.
**Por quê:** domínio diferente (marca pessoal/conteúdo vs. CRM da clínica), stack diferente
(Notion + n8n vs. Next.js + Supabase). Pode virar repositório próprio quando houver código de
integração.

## 2026-11-24 — Base de conhecimento com fonte e status em cada trecho
**Decisão (técnica):** todo item da base é marcado como [Trello], [Plano mestre], [Decisão],
[Hipótese] ou [Pendente P-xx].
**Por quê:** a regra "não inventar" só é verificável se cada afirmação tiver origem. Permite ao
agente distinguir fato de proposta e de lacuna.

## 2026-11-24 — Fonte bruta separada da base
**Decisão (técnica):** o levantamento do Trello fica intacto em `fontes/`; a base reorganiza.
**Por quê:** rastreabilidade. Se houver dúvida sobre um trecho da base, a origem está preservada.
