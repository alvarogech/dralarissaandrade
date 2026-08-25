# Integração anamnese-app → STIMMA OS

`anamnese-app` (repositório próprio `alvarogech/anamnese-larissa-andrade`, Netlify e projeto
Supabase próprios — `zuxzkfaqymnbgchvnjla`) e `stimma-os` (este repositório, projeto Supabase
`fjxvseuopzhfwdraszvp`) são sistemas separados, sem banco compartilhado. Não existe trigger de
banco cruzando os dois. A ligação é uma chamada HTTP simples, do mesmo jeito que qualquer
integração externa deste projeto: sem acoplamento de schema, protegida por segredo compartilhado.

## Fluxo

```text
paciente preenche anamnese (hof ou odontologia, publico, sem login)
  → POST /api/anamnese/{hof,odontologia} no anamnese-app
  → handleAnamneseSubmission grava em anamneses (Supabase do anamnese-app)
  → (fire-and-forget, nunca bloqueia a resposta ao paciente)
    notifyNewAnamnese()   — e-mail interno, já existia
    notifyStimmaOS()      — NOVO: POST para o STIMMA OS
  → POST /api/intake/anamnese no stimma-os
    1. valida segredo compartilhado (header x-intake-secret)
    2. resolve paciente por telefone/nome (lib/sync/patient-matching.ts — mesma regra de
       nunca vincular só por nome, mesma usada pelo Sync Engine do Simples Dental)
    3. paciente nova → cria em patients, define estagio inicial, escreve pipeline_history
       via lib/pipeline/change-stage.ts (nunca um UPDATE solto)
    4. paciente já existente → NÃO mexe no estágio dela (pode já estar em qualquer ponto do
       funil) — só cria uma task "Nova anamnese recebida" para alguém revisar
    5. grava audit_logs sempre
```

## O que é enviado (minimização deliberada)

Só identificação + inteligência comercial já capturada pelo formulário — **nunca** resposta
clínica (`answers` completo), CPF, ou dados de saúde/alergia/gestação:

```json
{
  "anamneseId": "uuid",
  "type": "hof" | "odontologia",
  "fullName": "string",
  "phone": "só dígitos",
  "birthDate": "YYYY-MM-DD",
  "email": "string | null",
  "appointmentDate": "YYYY-MM-DD | null",
  "origem": "string | null",
  "origemOutro": "string | null",
  "indicacaoPor": "string | null",
  "canalPreferido": "string | null"
}
```

CPF fica só no `anamnese-app` (onde já é coletado por exigência clínica/legal) — o STIMMA OS é
gerencial, não replica documento de identidade (ver `SECURITY.md` §minimização).

## Estágio inicial (paciente nova)

Decidido só por dado diretamente observável no payload, nunca por interpretação:

- `appointmentDate` preenchido → estágio `evaluation_scheduled`, próxima ação "Confirmar
  avaliação agendada".
- sem `appointmentDate` → estágio `new_lead`, próxima ação "Revisar anamnese e entrar em
  contato".

Em ambos os casos, `next_action_due_at` = próximo dia útil — nunca fica sem próxima ação (regra
de ouro cumprida desde a criação, não só alertada depois).

## Origem e tag

`origem`/`origem_outro` do formulário vira `patients.campaign` (texto livre, preserva o que a
paciente realmente respondeu). `lead_source_id` aponta para uma origem fixa `anamnese`
(`lead_sources.key = 'anamnese'`, criada automaticamente se não existir) — não tentamos mapear o
texto livre de `origem` para um enum de canal, porque não temos certeza dos valores possíveis do
formulário sem arriscar inventar categoria errada. `type` (hof/odontologia) vira uma tag
(`tags`/`patient_tags`) — dado real, direto, sem interpretação.

## Segredo compartilhado

`ANAMNESE_INTAKE_SECRET` — mesma string configurada nos dois projetos Netlify (anamnese-app e
stimma-os). Gerado uma vez, nunca commitado (`.env.example` documenta a chave sem valor). Sem
esse header correto, `POST /api/intake/anamnese` responde 401 e não escreve nada.

## Confiabilidade

A chamada de `anamnese-app` para `stimma-os` é fire-and-forget com timeout curto (5s) — se o
STIMMA OS estiver fora do ar, a paciente recebe a confirmação normalmente e a anamnese fica
salva; só a criação automática do lead no CRM não acontece. Não há fila de retry nesta primeira
versão — se isso vier a ser um problema real (falha detectada com frequência), o próximo passo é
comparar `anamneses.id` do anamnese-app com o que já existe em `patients`/`pipeline_history` do
STIMMA OS periodicamente, não reconstruir um sistema de fila do zero.
