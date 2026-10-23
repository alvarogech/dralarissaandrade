Tarefa: descobrir por que o e-mail de "Esqueci minha senha" do STIMMA OS não chegou e deixar a configuração de login por e-mail correta. Trabalhe só no painel do Supabase, siga os passos na ordem e me reporte o resultado exato de cada um. Pare e me avise ao primeiro erro ou divergência.

Regras:
- Projeto: "stimma-os", ref fjxvseuopzhfwdraszvp, organização "larissaandrade.odonto@gmail.com's Org". Não use nenhum outro projeto nem o conector MCP do Supabase — só o painel no navegador.
- Não crie, exclua ou altere usuários, senhas, tabelas, dados, chaves de API ou políticas.
- Não digite nenhuma senha nem credencial de SMTP. Se algum passo pedir login ou credencial, pare e me avise.
- Não copie para o relatório tokens, links de recuperação ou chaves que aparecerem nos logs.

PASSO 1 — Abrir o projeto certo
Abra https://supabase.com/dashboard/project/fjxvseuopzhfwdraszvp
Confirme que o projeto se chama "stimma-os". Se não tiver acesso ou pedir login, pare e me avise.

PASSO 2 — Diagnóstico nos logs (só leitura)
Vá em Logs → Auth (ou "Logs & Analytics" → Auth). Filtre as últimas 24 horas e procure eventos de recuperação de senha / envio de e-mail (recover, mail, magiclink, otp) para alvaroh.gyn@gmail.com.
Para cada evento encontrado, me informe: horário, tipo de evento, status HTTP e a mensagem de erro literal (ex.: "Email address not authorized", "email rate limit exceeded"), sem tokens ou links.
Se não houver nenhum evento, diga isso explicitamente.

PASSO 3 — SMTP (só leitura)
Vá em Authentication → Emails → SMTP Settings (ou "Emails" → SMTP). Informe apenas se o SMTP personalizado está ATIVADO ou DESATIVADO e, se ativado, o remetente (sender email). Não altere nada.

PASSO 4 — URLs de redirecionamento
Vá em Authentication → URL Configuration.
- Informe o valor atual de "Site URL" e a lista de "Redirect URLs".
- Se o Site URL não for exatamente https://app.larissaandrade.com.br, altere para esse valor e salve.
- Se https://app.larissaandrade.com.br/auth/set-password não estiver em Redirect URLs, adicione e salve.
- Recarregue a página e confirme que os valores ficaram salvos. Não remova nenhuma URL existente.

PASSO 5 — Template do código por e-mail
Vá em Authentication → Emails → Templates → "Magic Link".
- Não apague nada do conteúdo atual.
- Acrescente no INÍCIO do corpo da mensagem (Message body) esta linha, exatamente assim:
  <p>Seu código de acesso ao STIMMA OS: <strong>{{ .Token }}</strong></p>
- Salve, recarregue e confirme que a linha ficou no template.
- Não altere os outros templates (Reset Password, Invite, Confirm signup etc.).

PASSO 6 — Liberar a entrega para o e-mail do Álvaro (só se o PASSO 3 indicou SMTP DESATIVADO)
O e-mail padrão do Supabase só entrega para membros da equipe da organização.
Vá em Organization settings → Team (da organização "larissaandrade.odonto@gmail.com's Org").
- Veja se alvaroh.gyn@gmail.com já é membro e informe o papel.
- Se não for membro: ANTES de enviar, me pergunte se pode convidar. Com minha confirmação, convide alvaroh.gyn@gmail.com com o papel de MENOR permissão disponível (ex.: "Read-only"; se não existir, "Developer") e informe qual papel foi usado.

Relatório final: para cada passo, diga o que encontrou, o que alterou (antes → depois) e o que não foi possível fazer. Não diga que algo foi salvo se não viu o valor salvo na tela após recarregar.
