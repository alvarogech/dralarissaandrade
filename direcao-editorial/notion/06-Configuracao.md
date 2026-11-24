# 06 — Procedimento de configuração do Notion

Tempo estimado: cerca de 15 minutos de script e de 30 a 45 minutos de ajustes manuais.
Requisitos: Node 18+ e acesso de administrador ao workspace do Notion.

## 1. Criar a conexão (manual, uma vez)
1. No Notion: **Configurações → Conexões → Desenvolver ou gerenciar integrações → Nova
   integração**. Tipo **Interna**, nome "Central Editorial".
2. Capacidades: ler conteúdo, atualizar conteúdo, inserir conteúdo. Ler comentários é opcional
   (Fase 4). Sem acesso a informações de usuário com e-mail.
3. Copie o token da integração. **Não cole em chat, documento nem commit.**

## 2. Criar a página-mãe (manual)
1. Crie uma página vazia, por exemplo "Direção Editorial", no workspace.
2. Na página: **⋯ → Conexões → adicionar "Central Editorial"**.
3. Copie o ID da página: são os 32 caracteres no fim da URL.

## 3. Configurar o ambiente local
```powershell
cd direcao-editorial\notion
Copy-Item .env.example .env
notepad .env   # preencher NOTION_TOKEN e NOTION_PARENT_PAGE_ID
```
O `.env` e a pasta `.state/` estão no `.gitignore`.

## 4. Validar e simular (sem tocar no Notion)
```powershell
node scripts/validar.mjs
node scripts/setup.mjs
node scripts/importar.mjs
```
Esperado: `0 erro(s)` e a contagem de 11 bases, 253 propriedades e 31 views; na importação,
27 pendências, 6 referências, 3 aprendizados e 21 conteúdos.

## 5. Criar a estrutura
```powershell
node scripts/setup.mjs --apply
```
- Cria as páginas, as 11 bases (em 3 fases: campos simples → relações e status → fórmulas) e as
  31 views.
- Grava os IDs em `.state/notion-ids.json`. **Rodar de novo é seguro**: só cria o que falta.
- No fim, mostra o relatório: criados, já existentes, **falhas** e itens manuais. Falha não é
  escondida. Se algo falhar, corrija e rode de novo, ou faça à mão.
- Registra a própria execução na base Execuções.

## 6. Importar o inventário
```powershell
node scripts/importar.mjs --apply
```
Deduplica pela Chave: o que já existe é **preservado**, não sobrescrito.

## 7. Ajustes manuais (a API não cobre)
- [ ] **Status de Conteúdos:** se apareceram as opções padrão *Not started / In progress /
      Done*, apagar (Propriedade → Editar).
- [ ] **Formulário "Registrar ideia"** (página Larissa): perguntas *Qual a ideia ou o que
      aconteceu?* (Título), *Conte mais, se quiser* (Relato), *Áudio ou foto* (adicionar uma
      propriedade de arquivo "Anexo" se quiser). Valores fixos: Status = Ideia, Origem = Larissa.
- [ ] **Formulário "Guardar referência"**: Link, *O que é?* (Referência), *Por que é útil?*.
      Valores fixos: Status = Nova, Origem = Larissa.
- [ ] **Gráficos** na página Gestão: distribuição por Pilar e por Objetivo (base Conteúdos) e
      planejado x publicado por mês.
- [ ] **Quadros:** marcar "ocultar grupos vazios" no Meu quadro e no Por pilar.
- [ ] **Agrupamento por opção de status:** se o Meu quadro tiver sido criado agrupado pelos
      grupos (A fazer, Em andamento, Concluído), trocar para agrupar por opção.
- [ ] **Permissões** conforme `04-Responsabilidades-e-permissoes.md`.
- [ ] **Convidar** a Larissa e a social media, e fixar a página de cada uma na barra lateral delas.
- [ ] **Bloquear estrutura** das bases (⋯ → Bloquear base), para ninguém mudar colunas por acidente.
- [ ] Opcional: botão "Registrar dificuldade" na página Hoje.

## 8. Conferência final
Siga os critérios em `07-Criterios-de-aceite.md`.

## Desfazer
Os scripts nunca apagam nada. Para recomeçar: mover a página "Central Editorial" para a
lixeira no Notion e apagar `.state/notion-ids.json`.
