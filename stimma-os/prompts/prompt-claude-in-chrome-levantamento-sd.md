Tarefa: fazer um levantamento SOMENTE LEITURA no Simples Dental da Clínica Stimma (Dra. Larissa Andrade) e me devolver um JSON no formato "stimma-entrada-v1", que eu vou colar na tela Entrada do STIMMA OS. Você não grava nada em lugar nenhum: só lê telas e monta o texto.

PARÂMETROS (ajuste aqui se eu pedir outro período)
- Hoje: 2026-10-23 (sexta-feira)
- Período da agenda: de 2026-10-16 até 2026-10-23
- Janela de aniversários: de 2026-10-24 até 2026-10-31
- Consultado por: alvaro

REGRAS ABSOLUTAS
1. Só leitura. Não clique em salvar, editar, excluir, copiar compromisso, finalizar, confirmar, mover cartão, enviar mensagem, "Lembrar por WhatsApp Web", nem em nenhum toggle de comunicação. Não altere filtros salvos nem configurações. Abrir popover, ficha e abas para ler está liberado.
2. Não abra Financeiro, Simples Pay, a aba Débitos da ficha, Anamnese, Imagens nem Documentos. O módulo financeiro está suspenso no STIMMA OS: não traga valores, parcelas, débitos, recebimentos nem itens do tipo "cobranca". Em orçamentos, não traga valores.
3. Minimização de dados: de cada paciente traga só nome, código interno, número, ID da ficha (o número que aparece na URL /simples/pacientes/ID) e celular. Nunca traga CPF, endereço, e-mail, dados de anamnese nem detalhes clínicos além do nome do procedimento/motivo que aparece na agenda.
4. Não invente nada. Se um campo não aparece na tela, omita. Se você leu algo mas não tem certeza (texto cortado, status ambíguo, data deduzida), inclua o campo E coloque o nome dele na lista "a_conferir" do item.
5. Leia por texto/rótulo da tela, não por posição. Se uma tela estiver diferente do descrito aqui (menu sumiu, status com outro nome, página não carrega), não adivinhe: pule aquela parte e explique no relatório final.
6. Se aparecer pedido de login, senha, código, termo para aceitar ou qualquer diálogo inesperado, PARE e me avise. Não faça login por mim.

PASSO 1 — Conferir o acesso
Abra https://app.simplesdental.com/simples/agenda. Confirme que está logado na clínica da Dra. Larissa Andrade (Clínica Stimma). Se pedir login, PARE e me avise.

PASSO 2 — Agenda do período (atendimentos, faltas e cancelamentos)
Na agenda, percorra dia a dia o período definido acima, com todos os profissionais. Para cada compromisso, abra o popover e anote: paciente (nome e celular), data, hora, status exato como aparece, profissional e "Motivo da consulta". Para obter código, número e ID da ficha, abra a ficha da paciente (aba Sobre) a partir do popover. Se a mesma paciente aparecer várias vezes, leia a ficha uma vez só.
- Status "Finalizada" (ou outro que diga claramente realizado/atendido/concluído) vira um item "atendimento_realizado".
- Falta ou cancelamento vira um item "recuperacao_falta" com "ocorrencia" igual a "falta" ou "cancelamento".
- "Confirmada", "Agendada" e qualquer outro status de compromisso futuro ou não realizado NÃO viram item. Agendado não é atendido.
- Se o status de um dia passado ainda estiver como "Confirmada" ou "Agendada" (nem finalizado, nem falta), não decida sozinho: crie um item "outro" com acao "Conferir no Simples Dental se o atendimento de DD/MM aconteceu", e coloque "status_no_sd" na lista "a_conferir".

PASSO 3 — Tratamento em aberto sem consulta
Abra https://app.simplesdental.com/simples/dashboard/indicadores e procure o painel de Pacientes, indicador "pacientes com tratamento em aberto sem consulta". Se der para abrir a lista, cada paciente vira um item "continuidade" com "contexto" descrevendo o que a tela mostra (por exemplo, o nome do tratamento em aberto), e "contexto" na lista "a_conferir". Se a lista não abrir, anote só o número total no relatório final e não crie itens.

PASSO 4 — Aniversariantes
No mesmo painel de indicadores (ou em Relatórios > Pacientes > Aniversariantes), liste quem faz aniversário na janela definida acima. Cada uma vira um item "relacionamento" com "subtipo" igual a "aniversario" e "data_aniversario" no formato MM-DD. Não traga o ano de nascimento nem a idade.

PASSO 5 — Orçamentos em aberto (Vendas)
Abra https://app.simplesdental.com/simples/vendas. Na coluna "Em aberto" (e "Em andamento", se existir), cada cartão vira um item "outro" com acao "Retomar orçamento em aberto" e contexto com o nome do procedimento/orçamento e há quantos dias está em aberto. Não traga valores. Se houver mais de 40 cartões, traga os 40 mais antigos e diga no relatório quantos ficaram de fora.

FORMATO DE CADA ITEM
Campos comuns a todos:
- "tipo": um destes: "atendimento_realizado", "recuperacao_falta", "continuidade", "relacionamento", "outro".
- "paciente": objeto com "nome", "sd_codigo" (código interno), "sd_numero" (número), "sd_ficha_id" (ID da URL da ficha) e "telefone" (só dígitos, com DDD). Inclua os que encontrar. É obrigatório pelo menos um dos três identificadores do Simples Dental, ou então nome e telefone juntos.
- "chave_origem": identificador estável para não duplicar se eu colar de novo. Use "sd-atend-FICHA-AAAA-MM-DD" para atendimento, "sd-falta-FICHA-AAAA-MM-DD" para falta/cancelamento, "sd-tratamento-FICHA" para continuidade, "sd-aniv-FICHA-2026" para aniversário, "sd-venda-FICHA-PROCEDIMENTO" para orçamento e "sd-conferir-FICHA-AAAA-MM-DD" para o caso de conferência (FICHA = sd_ficha_id; sem ele, use o sd_codigo).
- "a_conferir": lista com os nomes dos campos incertos (pode ser vazia: []).
- "nota_ia" (opcional): só contexto curto que ajude a concierge, nunca diagnóstico, nunca valor, nunca "já foi feito".

Campos por tipo:
- atendimento_realizado: "data_atendimento" (AAAA-MM-DD exata), "status_no_sd" (exatamente como aparece, por exemplo "Finalizada"), "profissional", "procedimento" (o motivo da consulta). NÃO inclua "marcos": a gestão escolhe quais marcos de retorno fazem sentido.
- recuperacao_falta: "data_ocorrencia" (AAAA-MM-DD), "ocorrencia" ("falta" ou "cancelamento"), "procedimento" se houver.
- continuidade: "contexto" (obrigatório).
- relacionamento: "subtipo" ("aniversario"), "data_aniversario" (MM-DD).
- outro: "acao" (obrigatório) e "contexto".

FORMATO DO LOTE (o JSON final)
{
  "contrato": "stimma-entrada-v1",
  "lote": {
    "origem": "simples_dental",
    "consultado_em": "DATA E HORA DE AGORA no formato 2026-10-23T15:40:00-03:00",
    "consultado_por": "alvaro",
    "ferramenta": "claude_chrome",
    "periodo": { "de": "2026-10-16", "ate": "2026-10-23" }
  },
  "itens": [
    { "tipo": "atendimento_realizado", "chave_origem": "sd-atend-123456-2026-10-20", "paciente": { "nome": "Nome Completo", "sd_codigo": "1042", "sd_numero": "318", "sd_ficha_id": "123456", "telefone": "62999990000" }, "data_atendimento": "2026-10-20", "status_no_sd": "Finalizada", "profissional": "Dra. Larissa", "procedimento": "Toxina botulínica", "a_conferir": [] },
    { "tipo": "recuperacao_falta", "chave_origem": "sd-falta-654321-2026-10-21", "paciente": { "nome": "Nome Completo", "sd_ficha_id": "654321", "telefone": "62988887777" }, "data_ocorrencia": "2026-10-21", "ocorrencia": "falta", "a_conferir": [] }
  ]
}
(Os dois itens acima são só exemplo de formato. Não os inclua.)

Regras do JSON: JSON válido (aspas duplas, sem vírgula sobrando, sem comentários), no máximo 500 itens, datas sempre AAAA-MM-DD, nenhuma paciente inventada, um item por ocorrência real.

ENTREGA
1. Primeiro, um relatório curto em texto:
   - quantos compromissos você leu por dia;
   - quantos itens de cada tipo gerou;
   - o que ficou de fora e por quê (tela diferente, lista que não abriu, limite de 40 cartões);
   - qualquer coisa estranha que viu.
2. Depois, o JSON completo dentro de UM único bloco de código, do primeiro "{" ao último "}", sem nada depois.
Não cole o JSON em nenhum site. Eu mesmo colo no STIMMA OS.
