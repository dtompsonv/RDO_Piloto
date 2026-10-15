# Relatório Diário de Obra

Aplicativo estático em português, com Firebase Authentication, Firestore e Storage. O HTML preserva o formulário original; `app.js` concentra navegação diária, anexos e persistência.

## Correções

- Abrir a mesma obra e data reutiliza o RDO, com índice diário criado em transação. O calendário navega entre relatórios, sem alterar a data do relatório anterior. RDOs legados são pesquisados antes da criação; duplicados antigos são preservados e sinalizados.
- Cada novo dia/obra começa com formulário limpo e dados cadastrais da obra. Abrir links `?doc=` mostra o contêiner completo e identifica a obra pelo documento.
- Mão de obra e equipamentos são reconstruídos uma vez; comentários e ocorrências preservam a data original.
- Fotos, legendas, logo personalizado e imagens de assinatura são persistidos no Storage. Os relatórios e revisões guardam referências; o logo padrão não gera upload. Imagens aceitas: PNG, JPEG, GIF e WebP, até 5 MB cada. Imagens de assinatura são anexos visuais, não assinatura digital certificada.
- Salvamento usa uma transação com histórico imutável. Alterações em campos diferentes são combinadas; conflitos no mesmo campo ou lista bloqueiam o salvamento, preservam a edição local e oferecem exportação JSON e recarga explícita. Listas são tratadas como unidade para preservar remoções e ordem.
- Erros de gravação/upload não mostram sucesso e impedem a navegação. Fechar a aba com alterações pendentes gera aviso do navegador; não há garantia de persistência offline nesta entrega.
- Login Google e permissões por obra substituem a identidade anônima. Campos inseridos em templates HTML são escapados; atividades, comentários e imagens usam propriedades do DOM.

## Ativar no Firebase antes de publicar esta versão

As regras deste repositório **não são publicadas automaticamente**. O GitHub Pages publica os arquivos da aplicação, mas não configura o Firebase.

1. Faça backup/exportação dos dados atuais e teste primeiro em um projeto de homologação. Mantenha a versão anterior do Pages até concluir estes passos.
2. Em Authentication, habilite o provedor Google. Adicione o domínio usado pelo Pages (`dtompsonv.github.io`) aos domínios autorizados. Para testes locais com Firebase real, autorize também `localhost` conforme necessário.
3. Ative o Cloud Storage no projeto, confirme que o bucket corresponde a `storageBucket` da configuração e conclua os requisitos de conta/faturamento apresentados pelo Console. Configure o acesso do Storage ao Firestore quando solicitado pela publicação das regras. Não use regras públicas de teste.
4. Entre uma vez com sua conta Google e copie o UID em Authentication. Nas obras existentes, pelo Console, acrescente:

   ```json
   {"proprietario":"UID_DO_RESPONSAVEL","membros":["UID_DO_RESPONSAVEL"],"editores":["UID_DO_RESPONSAVEL"]}
   ```

   Preserve os demais campos. Para colaboradores, inclua seus UIDs em `membros` e, se puderem editar, também em `editores`. A gestão dos membros nesta entrega é feita pelo administrador no Console. Obras novas recebem automaticamente o criador como proprietário e editor. Obras antigas sem esses campos ficarão fora da listagem por segurança.
5. Publique regras e índices com Firebase CLI autenticado na sua conta:

   ```sh
   npm install
   npx firebase deploy --project rdo-piloto --only firestore:rules,firestore:indexes,storage
   ```

   Aguarde a conclusão do índice de `rdos` por `obraId` e `dados.campos.dataRelatorio`. A configuração embutida identifica o aplicativo web; o controle de acesso depende de Authentication e das regras publicadas.
6. Publique esta branch no Pages após validar login, criação/reabertura diária, upload, histórico e acesso de uma segunda conta. O teste automatizado de interface usa Firebase simulado; não valida a configuração do projeto real.

Os links compartilhados exigem login e participação na obra. URLs de download de anexos contêm tokens de acesso do Storage: trate os links de imagens como conteúdo compartilhável e não os publique fora do grupo autorizado. Os objetos são imutáveis para que revisões antigas continuem apontando para a imagem original. Remoção visual não apaga anexos das revisões; limpeza definitiva de dados e arquivos deve ser administrada separadamente.

Se já existirem RDOs duplicados para uma data, o índice aponta inicialmente para o documento mais recentemente modificado. Os outros não são apagados automaticamente. RDOs antigos sem data continuam acessíveis por seu link; regularize a data pelo Console antes de indexá-los.

## Testes

```sh
npm install
npx playwright install chromium
npm test
npm run test:rules
```

Os testes de regras usam emuladores com o projeto fictício `demo-rdo-piloto` e precisam de Java 21. Cobrem acesso anônimo, membros, edição, escalada de permissões, revisões, índice diário e anexos. O workflow do GitHub executa ambos os conjuntos sem credenciais de produção.

Para executar os mesmos cenários de interface manualmente no navegador, sem instalar Chromium:

```sh
npm run test:serve
```

Abra `http://127.0.0.1:4173/test`. O resultado aparece no topo. Esse servidor injeta exclusivamente dados simulados e nunca conecta o aplicativo ao Firebase real. Não use esse endereço para trabalho diário.

## Publicar em rdo-piloto.web.app

O endereço de destino escolhido é `https://rdo-piloto.web.app`, pelo Firebase Hosting do projeto `rdo-piloto`. Não é preciso comprar domínio nem alterar o DNS. O endereço só estará ativo após uma publicação bem-sucedida; a configuração no repositório não publica o site automaticamente.

Conclua primeiro os passos de Authentication, Storage, permissões e regras descritos acima. Em Authentication → Settings → Authorized domains, confirme que `rdo-piloto.web.app` está autorizado. Não altere `authDomain` da configuração existente apenas para trocar o endereço do site.

Na pasta do projeto, com Node.js instalado:

```sh
npm install
npx firebase login
npx firebase hosting:sites:list --project rdo-piloto
npm run deploy:hosting
```

Use a conta Google que administra o projeto `rdo-piloto` e confirme que o site `rdo-piloto` pertence a esse projeto. Se o comando listar erro de acesso ou o site não existir, regularize isso no Console antes de publicar. Não crie outro projeto com o mesmo nome para contornar um erro de permissão.

O comando de publicação envia somente o Hosting. Ele não publica regras, não altera usuários e não migra dados. O `predeploy` prepara `public/` com uma lista explícita de arquivos: `index.html` e `app.js`. Scripts de teste, regras, documentação, arquivos locais e dependências ficam fora da publicação. Arquivos inesperados em `public/` interrompem a preparação para evitar envio acidental.

Após a CLI confirmar a publicação, abra `https://rdo-piloto.web.app`, valide o login e a reabertura de um RDO, incluindo anexos. Os links de colaboração gerados nesse endereço passam a usar o novo domínio. Links antigos do GitHub Pages continuam no endereço antigo; redirecionamento não faz parte desta configuração. O domínio `der.com.br` não é utilizado.

Referência: [Firebase Hosting — primeiros passos](https://firebase.google.com/docs/hosting/quickstart).

