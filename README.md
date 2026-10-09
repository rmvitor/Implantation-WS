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
- **Categoria e módulo:** Chamado, Tarefa, Agenda e Pendência, independentes da situação. Os módulos de Suprimentos são Compras e Contratos, Almoxarifado, Patrimônio, Frota, Fiscalização de contrato e Elicita. Um chamado pode estar em andamento ou em homologação. Número, link do chamado e situação na fábrica continuam registrados; o cadastro é local, sem envio automático à fábrica.
- **Passagem de trabalho:** responsável, prazo, problema, impacto, próxima ação, quem precisa agir agora, dependência, evidências e critério de conclusão. Os campos de contexto podem ser preenchidos aos poucos; o formulário mostra o que falta.
- **Homologação da migração:** tela própria com matriz de módulos × entidades. Em “Configurar migração”, selecione somente as combinações que recebem dados do sistema anterior. Cada conferência tem uma rotina ajustável, resultado (A conferir, Divergência ou OK), responsável, data e referência comparada. “Não migra” não exige OK. A liberação do módulo acompanha os OKs das suas entidades; a liberação geral exige todos os OKs previstos e registra o responsável no histórico. Alterar o escopo, editar as entidades ou reabrir uma conferência reabre a liberação, preservando o histórico. Divergências podem gerar pendências vinculadas no quadro; resolver a pendência não dá OK automaticamente nos dados.
- **Checklists das atividades:** continuam disponíveis por entidade para rotinas do quadro. Não geram automaticamente OKs na homologação da migração.
- **Evidências:** texto e links de exemplos/relatórios, link do chamado e até 3 arquivos de 1 MB por cartão (PNG, JPG, WebP, PDF ou TXT). Os anexos entram no backup. A aplicação verifica o limite local antes de salvar e mantém o formulário aberto se faltar espaço.
- **Concluídos e histórico:** a conclusão exige critério, nome de quem validou, data e evidência da validação. Esse registro é copiado para o histórico. Reabrir uma atividade remove a validação atual, mas preserva o registro histórico e os anexos. O nome é informado manualmente; não representa autenticação ou assinatura.
- **Visualizações:** Quadro arrastável, Lista agrupada por situação, Tabela com ordenação e Calendário mensal navegável. São os mesmos dados e filtros, sem duplicação de cartões. A preferência é salva por projeto. No calendário, é possível abrir ou criar atividades por data; itens sem data ficam acessíveis abaixo da grade.
- **Prioridade:** Alta, Normal ou Baixa, em tag junto ao módulo. Use “Ordenar cartões” para exibir primeiro as atividades de alta prioridade; essa preferência fica salva por município. A tabela também tem ordenação própria por prioridade.
- **Aparência:** abra o perfil pelo avatar ou pelo rodapé da barra lateral para escolher a cor principal e o tema claro ou escuro True Black. A prévia pode ser cancelada; as escolhas salvas persistem neste navegador e entram no backup.
- **Telas menores:** use a rolagem horizontal, a barra ou os botões acima do quadro para chegar às demais fases. Quando o quadro estiver em foco, as setas do teclado também permitem navegar.
- **Agenda:** compromissos, prazos e treinamentos por data, independentemente da situação do cartão.
- **Treinamentos:** agenda própria, cadastrada manualmente a partir da programação recebida por e-mail. Sem integração de e-mail nesta versão.

O trabalho pode acontecer em paralelo. Arraste um cartão ou edite sua situação para movimentá-lo sem passagem obrigatória pelas outras colunas. A movimentação tem indicação de destino e animação, respeitando a configuração de movimento reduzido do sistema. Ao arrastar para Concluídos, o formulário de validação abre antes de aplicar a conclusão. O progresso exibido corresponde à proporção de atividades concluídas com validação registrada; cada checklist tem seu próprio progresso.

O projeto inicial de Quatro Barras é uma demonstração baseada no fluxo fornecido. Crie seu município para começar com um quadro vazio. Os dados ficam separados por município.

## Instalar como app (PWA)

Abra o site publicado em HTTPS e use **Instalar app**, no menu lateral:

- Android, Chrome: botão de instalação ou menu ⋮ → Instalar app / Adicionar à tela inicial.
- iPhone/iPad, Safari: Compartilhar → Adicionar à Tela de Início; ative “Abrir como App” quando disponível.
- PC, Chrome/Edge: ícone de instalação na barra de endereço ou opção de instalação no menu do navegador.

A primeira abertura com internet prepara o acesso offline, incluindo as fontes. Depois disso, é possível abrir o app e registrar atividades ou conferências sem conexão. A instalação usa um manifesto com ícones PNG 192/512, ícone maskable e ícone Apple. O ID, a URL inicial e o service worker respeitam o caminho `/Implantation-WS/` no GitHub Pages.

Novas versões exibem **Atualizar app**. A atualização aguarda o fechamento de formulários e não apaga o armazenamento local. Os arquivos do app ficam em cache; os cadastros continuam em `localStorage`. Não há sincronização automática entre celular e PC. Se o sistema separar o armazenamento do app instalado e do navegador (como pode ocorrer no iOS), exporte um backup no navegador e restaure no app.

## Dados e limitações

Os dados ficam em `localStorage` no navegador que acessa o site, vinculados ao endereço/origem. Não há servidor de dados, contas ou sincronização entre usuários nesta versão. Publicar os arquivos do site não compartilha os dados cadastrados entre computadores.

Use **Dados e backup** para exportar ou restaurar um arquivo JSON. A restauração pede confirmação e substitui os dados atuais. O backup pode conter contatos e CPF; conserve-o em um local com acesso restrito. O CPF fica mascarado na visualização e pode ser editado no formulário.

A versão exibida no rodapé vem de `package.json`. Veja as mudanças em [CHANGELOG.md](CHANGELOG.md).

Os cadastros e backups da versão anterior são migrados sem apagar atividades, notas, datas, checklists, números de chamados ou histórico. Pendências e agendas antigas passam para A fazer, mantendo as datas; antigos cartões de Chamados passam para Aguardando retorno com etiqueta Chamado. Conclusões antigas permanecem na coluna, com o aviso “Validação não registrada” se não houver aceite. A migração não inventa evidências ou nomes de validadores. A homologação começa sem escopo configurado nos projetos existentes; checklists e conclusões anteriores não são convertidos em OKs da migração. O novo escopo, os registros de conferência e a liberação também são incluídos no backup.

Para uso compartilhado na empresa, uma etapa posterior precisa adicionar autenticação, banco de dados e controle de acesso. Não cadastre dados reais sensíveis em uma publicação aberta sem esse controle.

## Validação

```sh
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
npm run build
```

Os testes de domínio cobrem movimentação livre, validação obrigatória na conclusão, reabertura, histórico, checklists, migração de versões, filtros e integridade do backup. Os testes no navegador cobrem tela inicial, cadastro, edição, persistência, treinamentos, exportação/restauração, anexos, migração, troca de visualização, calendário, navegação móvel, rolagem, animação, prioridades, categorias, preferências de aparência e falhas de armazenamento.

Se não houver Chromium instalado, instale o navegador do Playwright com `npx playwright install chromium` e execute `npm run test:e2e` sem a variável acima. O arquivo de configuração inicia o servidor de desenvolvimento e um servidor de teste do build PWA sob `/Implantation-WS/` automaticamente quando necessário. O segundo usa uma cópia em `.local/pwa-site`, permitindo simular a troca do service worker sem alterar `dist`. As verificações de PWA cobrem instalação reconhecida pelo Chromium com perfil normal, metadados/ícones/escopo, gravação offline, atualização com formulário aberto e preservação dos dados. Os testes de homologação cobrem escopo, validação, liberação, reabertura, pendência vinculada, backup e falha de armazenamento.
