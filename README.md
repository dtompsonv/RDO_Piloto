# RDO — versão mínima para preenchimento diário e PDF

Aplicação estática publicada no Firebase Hosting em `https://rdo-piloto.web.app`. Usa o Firestore já configurado no piloto, sem introduzir dependência de Firebase Authentication ou Cloud Storage nesta entrega. As regras de acesso existentes não são modificadas. O trabalho de segurança e colaboração mais amplo permanece separado desta versão mínima.

## Como usar

1. Abra a obra em **Calendário / novo RDO** e escolha a data. Abrir um dia vazio não cria um registro no banco.
2. Preencha atividades, quantitativos, clima, comentários, ocorrências e, se necessário, fotos e assinaturas.
3. Clique em **Salvar RDO**. Aguarde **Salvo no servidor**. O relatório permanece aberto e aparece em **RDOs salvos neste mês**. Cada obra também tem **Abrir último RDO**.
4. Clique em **Salvar em PDF** e escolha **Salvar como PDF** na janela de impressão do navegador. O PDF contém o formulário atual, inclusive alterações ainda não salvas no servidor. Use **Salvar RDO** também para reencontrar esse conteúdo no calendário.
5. Navegue entre os dias e meses pelo calendário. Cada novo RDO é identificado por obra e data; registros antigos são reutilizados.

## Relatórios que pareciam desaparecer

Na inspeção inicial do banco, havia registros sem data e alguns sem vínculo com obra. Eles permaneciam no banco, mas o fluxo antigo criava outro documento a cada abertura e o calendário não abria os registros anteriores.

A página inicial agora mostra **RDOs antigos para recuperar**. Abra um deles, confira seu conteúdo, selecione obra e data e clique em **Vincular e salvar RDO**. O documento original é atualizado somente após essa ação. Se já houver outro RDO no mesmo dia, o vínculo é bloqueado para não sobrescrevê-lo. Registros existentes não são apagados automaticamente.

Os quantitativos são reconstruídos uma vez em cada abertura. Em registros antigos com nomes repetidos no mesmo grupo, a tela mantém a última quantidade daquele nome e informa a correção. Confira os totais antes de salvar: o sistema não soma as cópias criadas pelo erro anterior nem tenta inferir qual quantidade o usuário pretendia.

## Fotos, assinaturas e limites

Fotos e imagens de assinatura são comprimidas no navegador e armazenadas no próprio documento do RDO. Não é necessário ativar o Storage pago para esta versão mínima. Até 6 fotos por RDO, arquivos JPEG/PNG/WebP de até 10 MB antes da compressão. O conjunto do RDO tem limite conservador de 800.000 bytes: se exceder, o salvamento no servidor é bloqueado com aviso, preservando o rascunho local e a impressão. As imagens são reduzidas para uso no relatório; mantenha os originais separadamente quando precisar da resolução original.

Assinaturas são imagens anexadas ao relatório; esta versão não implementa assinatura digital certificada.

## Salvamento e rascunhos

Edições são guardadas como rascunho em IndexedDB no mesmo navegador/origem. O estado distingue rascunho local de gravação confirmada no servidor. Ao trocar de dia, alterações pendentes são salvas primeiro; em caso de falha, a navegação pede confirmação e preserva o rascunho local quando o navegador permite. Limpar os dados do navegador remove esses rascunhos. Abrir a aplicação e carregar o catálogo do servidor exige conexão; esta versão não promete funcionamento offline completo.

O salvamento usa transação e verifica a versão e o conteúdo de origem. Se outra sessão alterar o mesmo RDO, a edição não é sobrescrita silenciosamente: mantenha uma cópia em PDF e revise o registro atualizado. Um salvamento não reaplica o snapshot ao formulário, evitando esconder a tela ou sobrescrever texto digitado durante a requisição.

## Publicação

Prepare `public/` contendo somente `index.html` e `app.js` deste repositório. A configuração de Hosting aponta para o site `rdo-piloto` e evita cache desatualizado de HTML/JS. Publique com Firebase CLI autenticado:

```sh
firebase deploy --project rdo-piloto --only hosting
```

Não publique testes ou documentação na pasta pública. A publicação não migra nem apaga RDOs existentes e não altera regras do Firestore.

## Verificação

`npm test` executa cenários isolados com Firebase simulado: recuperação de registros sem data, quantitativos sem duplicação após reaberturas, 31 relatórios em um mês, rascunho após falha de salvamento, conflito entre sessões, fotos/assinaturas e layout de impressão. O runner recarrega de fato a página com os dados salvos e gera um PDF de exemplo. O workflow renderiza esse PDF em PNG para inspeção visual.

Para rodar no navegador sem instalar Chromium: `npm run test:serve`, depois abra `http://127.0.0.1:4174/test`. Essa rota sempre injeta o simulador e não acessa o Firebase real.
