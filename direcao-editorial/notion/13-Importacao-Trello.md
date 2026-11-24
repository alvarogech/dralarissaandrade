# 13 — Importação integral do Trello (preparada, aguardando o JSON)

O inventário atual veio de um **resumo** do quadro. Para trazer roteiros, descrições, checklists,
comentários e anexos, falta a exportação JSON (pendência P-00).

## Como exportar (gestão)
Trello › abrir o quadro › Menu › **Imprimir, exportar e compartilhar** › **Exportar como JSON** ›
salvar o arquivo em `direcao-editorial/fontes/trello-quadro.json`.
O arquivo pode conter comentários e nomes. Ele fica no repositório só se você quiser; senão, use
uma pasta fora do Git e passe o caminho.

## Como gerar o plano (offline, nada é escrito no Notion)
```powershell
node direcao-editorial/notion/scripts/trello-plano.mjs direcao-editorial/fontes/trello-quadro.json
```
Gera `notion/deploy/trello-plano.md` para revisão:
- **Casados:** cartão com par seguro (≥ 80% de semelhança no título e sem empate) em um Conteúdo já importado. Recebe descrição (no corpo, seção Roteiro), checklists, comentários, anexos (links), "Cartão do Trello" e "ID do cartão Trello".
- **Revisar:** semelhança incerta ou mais de um candidato. Uma pessoa escolhe.
- **Novos:** sem par. Entram como Ideia, Origem Trello.
- **Ignorados:** cartões arquivados.

## Regras
- **Não duplica**: o par é pela Chave `trello:C-xx`; depois da primeira aplicação, pelo "ID do cartão Trello".
- **Não sobrescreve trabalho da equipe**: se o Roteiro do Notion já foi editado, o texto do Trello vai para "Notas da equipe" com o rótulo "Texto original do Trello".
- **Anexos** do Trello exigem login para abrir; ficam como link. Imagens importantes devem ir para o Drive.
- O **Trello continua como fonte histórica** até a gestão marcar P-00 como Respondida.

Testado com uma amostra sintética (`test/trello-fixture.json`): `node test/trello-plano.test.mjs` (8 asserções).
