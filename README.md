# Implanta

Workspace em português para organizar a implantação de sistemas em municípios e facilitar a continuidade do trabalho entre colegas. Feito com React e Vite, com interface responsiva e fontes hospedadas junto ao site.

## Executar

Requer Node.js 22.12+ (validado com Node.js 24).

```sh
cd /workspace/Implantation-WS
npm ci --cache /tmp/implantacao-npm-cache
npm run dev -- --port 5173
```

Para gerar o site estático: `npm run build`. Os arquivos de publicação ficam em `dist/`; `npm run preview` serve essa versão para validação. Os caminhos relativos permitem servir o site sob `/Implantation-WS/`.

## Publicação

O workflow `.github/workflows/pages.yml` valida e publica o site no GitHub Pages a cada envio à branch `main`, ou manualmente pela aba Actions. Em **Settings → Pages**, a origem deve ser **GitHub Actions**. GitHub Pages em repositórios privados depende do plano do proprietário; não é necessário tornar o código público quando o plano permite esse recurso.

Se o Pages ainda estiver configurado para publicar uma branch, o workflow aguarda a publicação automática dessa branch antes de publicar `dist/`, evitando que os arquivos-fonte substituam a aplicação compilada. Selecionar GitHub Actions em Settings → Pages remove a publicação duplicada.

A publicação do site é independente da publicação do ambiente de desenvolvimento do Codex.

## Fluxo

- **Tela inicial:** projetos/municípios com busca, indicadores e cadastro de novas implantações. Ao abrir um município, o quadro apresenta seus dados separados dos demais projetos.
- **Situação de trabalho:** A fazer, Em andamento, Aguardando retorno, Em homologação e Concluídos. Qualquer atividade ou chamado pode circular entre essas situações.
- **Categoria e módulo:** Chamado, Tarefa, Agenda e Pendência, independentes da situação. Os módulos de Suprimentos são Compras e Contratos, Almoxarifado, Patrimônio, Frota, Fiscalização de contrato e Elicita. Um chamado pode estar em andamento ou em homologação. Número, link do chamado e situação na fábrica aparecem somente na categoria Chamado. Trocar de categoria mantém esses valores para eventual retorno; o cadastro não envia solicitações automaticamente à fábrica.
- **Passagem de trabalho:** responsável, prazo, problema, impacto, próxima ação, quem precisa agir agora, dependência, evidências e critério de conclusão. Os campos de contexto podem ser preenchidos aos poucos; o formulário mostra o que falta.
- **Homologação da migração:** tela própria com matriz de módulos × entidades. Em “Configurar migração”, selecione somente as combinações que recebem dados do sistema anterior. Cada conferência tem uma rotina ajustável, resultado (A conferir, Divergência ou OK), responsável, data e referência comparada. “Não migra” não exige OK. A liberação do módulo acompanha os OKs das suas entidades; a liberação geral exige todos os OKs previstos e registra o responsável no histórico. Alterar o escopo, editar as entidades ou reabrir uma conferência reabre a liberação, preservando o histórico. Divergências podem gerar pendências vinculadas no quadro; resolver a pendência não dá OK automaticamente nos dados.
- **Checklists das atividades:** continuam disponíveis por entidade para rotinas do quadro. Não geram automaticamente OKs na homologação da migração.
- **Edição da atividade:** checklists vêm antes do contexto. O botão Salvar/Criar no cabeçalho permanece acessível enquanto o formulário rola, com as mesmas validações do botão inferior. O campo **Atividades executadas** permite registrar o que foi feito e os resultados para o boletim; cada salvamento conserva uma cópia desse texto no histórico e no backup.
- **Evidências:** texto e links de exemplos/relatórios, link do chamado e até 3 arquivos de 1 MB por cartão (PNG, JPG, WebP, PDF ou TXT). Os anexos entram no backup. A aplicação verifica o limite local antes de salvar e mantém o formulário aberto se faltar espaço.
- **Concluídos e histórico:** a conclusão exige critério, nome de quem validou, data e evidência da validação. Esse registro é copiado para o histórico. Reabrir uma atividade remove a validação atual, mas preserva o registro histórico e os anexos. O nome é informado manualmente; não representa autenticação ou assinatura.
- **Visualizações:** Quadro arrastável, Lista agrupada por situação, Tabela com ordenação e Calendário mensal navegável. São os mesmos dados e filtros, sem duplicação de cartões. A preferência é salva por projeto. No calendário, é possível abrir ou criar atividades por data; itens sem data ficam acessíveis abaixo da grade.
- **Prioridade:** Alta, Normal ou Baixa, em tag junto ao módulo. Use “Ordenar cartões” para exibir primeiro as atividades de alta prioridade; essa preferência fica salva por município. A tabela também tem ordenação própria por prioridade.
- **Aparência:** abra o perfil pelo avatar ou pelo rodapé da barra lateral para escolher a cor principal e o tema claro ou escuro True Black. A prévia pode ser cancelada; as escolhas salvas persistem neste navegador e entram no backup.
- **Fases recolhidas:** use a seta no título de cada fase ou **Recolher fases / Expandir fases**. A fase recolhida mostra quantidades de atividades, prioridades altas, atrasos (validações em Concluídos) e chamados. Os resumos acompanham os filtros. Essa preferência é salva por município, entra no backup e não altera tarefas nem situações; as fases recolhidas continuam aceitando cartões arrastados.
- **Telas menores:** use a rolagem horizontal e as barras nativas espelhadas acima e abaixo do quadro. Ambas acompanham a mesma posição. Quando o quadro ou a barra superior estiverem em foco, as setas do teclado permitem navegar; Home/End na barra superior vão ao início/fim.
- **Atalhos:** clique com o botão direito em uma atividade do quadro, lista, tabela ou calendário para editar, mudar a situação ou a prioridade. No quadro, o botão de três pontos funciona por toque e Shift+F10 abre os atalhos pelo teclado. Setas navegam pelo menu e Escape fecha. Concluir pelos atalhos também exige registrar a validação.
- **Agenda:** compromissos, prazos, treinamentos e atendimentos por data, independentemente da situação do cartão. Salas em andamento aparecem na agenda de hoje até o término do período.
- **Treinamento/Atendimento:** acessível pelo menu **Capacitação e suporte**, com agenda própria com tipo de encontro, entidade, responsável, data/hora de início e término, duração calculada, situação, notas e link da sala. Um atendimento remoto pode ocupar vários dias e aparece em cada dia do período no calendário. O término deve ser posterior ao início; um período que termina à meia-noite não ocupa o dia seguinte. Cole o link da sala do Teams ou outro serviço e use **Abrir sala**; o cadastro não cria reuniões no serviço externo. Treinamentos anteriores e suas notas são preservados; ao editar, durações reconhecidas ajudam a preencher o término.

O trabalho pode acontecer em paralelo. Arraste um cartão ou edite sua situação para movimentá-lo sem passagem obrigatória pelas outras colunas. A movimentação tem indicação de destino e animação, respeitando a configuração de movimento reduzido do sistema. Ao arrastar para Concluídos, o formulário de validação abre antes de aplicar a conclusão. O progresso exibido corresponde à proporção de atividades concluídas com validação registrada; cada checklist tem seu próprio progresso.

O primeiro acesso começa sem projetos de demonstração. Crie um município ou use **Importar dados** na tela inicial. Os dados ficam separados por município; os exemplos usados pelos testes não são incluídos no site.

Use **Encerrar projeto** nos dados do município ou no card da tela inicial quando terminar a implantação. Ele sai dos ativos e do menu lateral, fica na aba **Encerrados** e conserva tarefas, homologações e histórico. **Reabrir projeto** devolve-o aos ativos. **Excluir projeto** remove os seus dados deste navegador e exige digitar o nome para confirmar; é possível exportar um backup antes.

## Instalar como app (PWA)

Abra o site publicado em HTTPS e use **Instalar app**, no menu lateral:

- Android, Chrome: botão de instalação ou menu ⋮ → Instalar app / Adicionar à tela inicial.
- iPhone/iPad, Safari: Compartilhar → Adicionar à Tela de Início; ative “Abrir como App” quando disponível.
- PC, Chrome/Edge: ícone de instalação na barra de endereço ou opção de instalação no menu do navegador.

A primeira abertura com internet prepara o acesso offline, incluindo as fontes. No modo local, depois disso é possível abrir o app e registrar atividades ou conferências sem conexão. O modo de equipe usa o Supabase e exige internet para entrar, carregar e salvar. A instalação usa um manifesto com ícones PNG 192/512, ícone maskable e ícone Apple. O ID, a URL inicial e o service worker respeitam o caminho `/Implantation-WS/` no GitHub Pages.

Novas versões exibem **Atualizar app**. A atualização aguarda o fechamento de formulários e não apaga o armazenamento local. Os arquivos do app ficam em cache. No modo local, os cadastros ficam em `localStorage` e não sincronizam entre aparelhos. No modo de equipe, os dados vêm do Supabase conforme as permissões e não são incluídos no cache offline. Se o sistema separar o armazenamento do app instalado e do navegador (como pode ocorrer no iOS), exporte um backup no navegador e restaure no app.

## Dados e equipe

A publicação abre o login usando a conexão pública da equipe. A estrutura do banco e a liberação do primeiro administrador continuam dependendo da ativação no painel Supabase. No modo local de desenvolvimento, os dados ficam em `localStorage` no navegador, vinculados ao endereço/origem. Para ativar a equipe ou usar outro Supabase, siga o [guia de ativação](supabase/README.md). A integração oferece login, cadastro pendente de aprovação, recuperação de senha, administração e permissões de leitura/edição por projeto. Publicar o site não cria esse banco: é necessário criar o projeto Supabase, aplicar a migração e liberar o primeiro administrador.

Use **Dados e backup** para exportar ou restaurar um arquivo JSON. A restauração pede confirmação. No modo local, substitui os dados atuais; no modo online, acrescenta/atualiza os projetos importados sem remover os demais, e exige administrador. O backup pode conter contatos e CPF; conserve-o em um local com acesso restrito. O CPF aparece com asteriscos nos dados do município. Use o olhinho para revelar ou ocultar quando precisar fechar o boletim; ao sair dessa tela ele volta a ficar oculto. O valor original continua no cadastro e no backup.

No modo local, para remover todos os projetos cadastrados neste aparelho, use **Dados e backup → Limpar workspace** e digite `LIMPAR`. Essa limpeza mantém somente as preferências de aparência. Uma atualização do site preserva cadastros existentes; ela não consegue apagar dados de outros navegadores ou aparelhos. Backups incluem também os projetos encerrados e podem representar um workspace vazio.

### Converter uma exportação do Trello

O conversor gera um JSON compatível com a importação existente e um relatório de conversão. Execute com os arquivos de dados fora do repositório público:

```sh
node scripts/convert-trello.mjs /caminho/trello.json /caminho/implanta.json
```

Selecione o arquivo gerado em **Importar dados** na tela inicial ou em **Dados e backup → Restaurar backup**. Confira o resumo antes de confirmar: restaurar substitui o workspace atual.

Listas de pendências passam para A fazer, chamados para Aguardando retorno e concluídos continuam em Concluídos. Números de chamados, prioridades, checklists, datas reconhecidas e histórico são preservados. Módulos identificados pelo título são sugestões para revisão; títulos ambíguos ficam sem módulo. Código Dream e contatos ausentes na origem ficam em branco. A situação na fábrica fica como Não informado quando não consta no Trello.

Cartões de módulos da lista de Homologação com checklist de entidades viram conferências por módulo × entidade na tela de homologação. As marcações existentes são mantidas na rotina, mas não geram OK formal, validador ou liberação. Cartões arquivados ficam preservados nos metadados do backup, sem retornar ao quadro ativo. O histórico é limitado às ações presentes no arquivo exportado pelo Trello.

A versão exibida no rodapé vem de `package.json`. Veja as mudanças em [CHANGELOG.md](CHANGELOG.md).

Os cadastros e backups da versão anterior são migrados sem apagar atividades, notas, datas, checklists, números de chamados ou histórico. Pendências e agendas antigas passam para A fazer, mantendo as datas; antigos cartões de Chamados passam para Aguardando retorno com etiqueta Chamado. Conclusões antigas permanecem na coluna, com o aviso “Validação não registrada” se não houver aceite. A migração não inventa evidências ou nomes de validadores. A homologação começa sem escopo configurado nos projetos existentes; checklists e conclusões anteriores não são convertidos em OKs da migração. O novo escopo, os registros de conferência e a liberação também são incluídos no backup.

O modo de equipe oferece autenticação, banco online e permissões por projeto. O primeiro administrador precisa ser liberado pelo responsável do Supabase conforme o guia de ativação.

## Validação

```sh
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
npm run build
```

Os testes de domínio cobrem movimentação livre, validação obrigatória na conclusão, reabertura, histórico, checklists, migração de versões, filtros, integridade do backup, ciclo dos projetos, workspace vazio e conversão do Trello. Os testes no navegador cobrem tela inicial vazia, cadastro, encerramento, reabertura, exclusão e limpeza com confirmação, edição, persistência, treinamentos, exportação/restauração, anexos, migração, troca de visualização, calendário, navegação móvel, rolagem, animação, prioridades, categorias, preferências de aparência e falhas de armazenamento.

Se não houver Chromium instalado, instale o navegador do Playwright com `npx playwright install chromium` e execute `npm run test:e2e` sem a variável acima. O arquivo de configuração inicia o servidor de desenvolvimento e um servidor de teste do build PWA sob `/Implantation-WS/` automaticamente quando necessário. O segundo usa uma cópia em `.local/pwa-site`, permitindo simular a troca do service worker sem alterar `dist`. As verificações de PWA cobrem instalação reconhecida pelo Chromium com perfil normal, metadados/ícones/escopo, gravação offline, atualização com formulário aberto e preservação dos dados. Os testes de homologação cobrem escopo, validação, liberação, reabertura, pendência vinculada, backup e falha de armazenamento.

## Versão 1.6.0

Barra de visualizações em uma linha, filtros compactos com recolhimento das fases, barras horizontais espelhadas sem setas e cabeçalho inteiro da fase clicável. Integração Supabase com login, gestão de usuários, liberação por projeto, gravação confirmada e proteção contra sobrescrita concorrente. O banco começa vazio; ativação em [supabase/README.md](supabase/README.md).

`npm run test:db` valida as políticas em um PostgreSQL descartável (veja o guia). O workflow executa esses testes antes da publicação. Os testes de navegador de equipe simulam o contrato HTTP do Supabase; e-mails e autenticação do serviço real dependem da ativação do projeto.

## Versão 1.6.1

Conexão pública padrão do Supabase na publicação, para abrir o login diretamente. Conexões escolhidas no aparelho continuam tendo prioridade. Exportação dos dados locais anteriores disponível na tela de login, sem envio automático. Falta de migração do banco mostra orientação para executar o SQL. O workflow verifica a API pública sem criar contas, enviar e-mails ou consultar dados de projetos.

## Versão 1.7.0

Treinamento/Atendimento com períodos de vários dias, link de sala, duração calculada e visualização diária no calendário. Agenda e indicadores incluem atendimentos em andamento; histórico e backups preservam os períodos e os registros anteriores. Os campos ficam no documento JSON do projeto: esta versão não exige outra migração SQL. Os testes incluem datas intermediárias, virada de dia, período inválido, edição, exportação/restauração e uso em celular.

## Versão 1.7.1

Tema claro com bases neutras, texto mais contrastado e marcações derivadas da cor escolhida. O padrão inicial usa azul e preserva preferências já salvas; o tema escuro mantém True Black. Navegação lateral com “Capacitação e suporte”, sem o bloco promocional.

Exclusão online compara os valores do JSON sem depender da ordem das propriedades devolvidas pelo PostgreSQL. Campos opcionais de cartões antigos recebem os mesmos padrões antes da comparação. Isso remove falsos conflitos sem permitir apagar um cartão que outro colega realmente alterou durante a edição. Testes verificam exclusão persistida, histórico, preservação de outras alterações e formulário conservado quando há falha ou conflito. Não exige nova migração SQL.

## Versão 1.8.0

Barra de navegação do projeto disponível em Atividades, Homologação, Agenda e Histórico, com indicação da área atual e uma linha no celular. O cabeçalho lateral mostra o município selecionado. A lista permite recolher fases e exibir seus resumos, compartilhando com o quadro a preferência salva por município e incluída nos backups.

Ações de encerrar, reabrir e excluir ficam nos dados do município e no card da tela inicial. Clique com o botão direito no card, pressione Shift+F10 com ele em foco ou use os três pontos para abrir atividades, consultar/editar dados, homologação, agenda, histórico e ações do projeto. Permissões continuam sendo verificadas, e encerramento/exclusão mantêm as confirmações.

No modo de equipe, abra o perfil pelo avatar ou pelo menu lateral e use **Finalizar sessão**. A sessão deste aparelho é encerrada e os dados online saem da tela; alterações de aparência ainda não salvas são descartadas. O modo local não oferece esse botão, pois não possui uma sessão autenticada. Não exige nova migração SQL.

## Versão 1.8.1

Capacitação integra a barra de navegação do projeto e o menu de ações rápidas, com acesso aos treinamentos e atendimentos remotos. Em telas menores, a barra mantém a área atual visível ao mudar pelo menu lateral. A conexão pública de produção usa por padrão o projeto Supabase informado; configurações específicas salvas no aparelho continuam sendo respeitadas. Não exige migração SQL.

## Versão 1.9.0

Cada município tem uma cor de identificação, ajustável em **Dados do município → Editar dados → Cor do projeto**, independente da aparência pessoal. O nome do projeto ocupa o título grande em todas as áreas e identifica a aba do navegador. O bloco superior da barra lateral permite trocar entre projetos ativos, mantendo a área em uso; a lista antiga dá lugar ao separador Gerenciamento.

Equipe e acessos passa a ter abas de usuários e permissões por projeto, com controles compactos e rascunhos preservados ao alternar entre elas. O projeto em uso fica selecionado inicialmente para liberação de acessos. A cor é incluída nos backups e nos dados compartilhados; projetos antigos continuam compatíveis. Não exige migração SQL.
