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

A publicação do site é independente da publicação do ambiente de desenvolvimento do Codex.

## Fluxo

- **Tela inicial:** projetos/municípios com busca, indicadores e cadastro de novas implantações. Ao abrir um município, o quadro apresenta seus dados separados dos demais projetos.
- **Situação de trabalho:** A fazer, Em andamento, Aguardando retorno, Em homologação e Concluídos. Qualquer atividade ou chamado pode circular entre essas situações.
- **Tipo e módulo:** etiquetas independentes da situação. Um chamado pode estar em andamento ou em homologação. Número, link do chamado e situação na fábrica continuam registrados; o cadastro é local, sem envio automático à fábrica.
- **Passagem de trabalho:** responsável, prazo, problema, impacto, próxima ação, quem precisa agir agora, dependência, evidências e critério de conclusão. Os campos de contexto podem ser preenchidos aos poucos; o formulário mostra o que falta.
- **Homologação:** um checklist independente para cada entidade. Itens podem ser adicionados, marcados ou removidos. Completar um checklist não conclui nem valida automaticamente a atividade.
- **Evidências:** texto e links de exemplos/relatórios, link do chamado e até 3 arquivos de 1 MB por cartão (PNG, JPG, WebP, PDF ou TXT). Os anexos entram no backup. A aplicação verifica o limite local antes de salvar e mantém o formulário aberto se faltar espaço.
- **Concluídos e histórico:** a conclusão exige critério, nome de quem validou, data e evidência da validação. Esse registro é copiado para o histórico. Reabrir uma atividade remove a validação atual, mas preserva o registro histórico e os anexos. O nome é informado manualmente; não representa autenticação ou assinatura.
- **Visualizações:** Quadro arrastável, Lista agrupada por situação, Tabela com ordenação e Calendário mensal navegável. São os mesmos dados e filtros, sem duplicação de cartões. A preferência é salva por projeto. No calendário, é possível abrir ou criar atividades por data; itens sem data ficam acessíveis abaixo da grade.
- **Agenda:** compromissos, prazos e treinamentos por data, independentemente da situação do cartão.
- **Treinamentos:** agenda própria, cadastrada manualmente a partir da programação recebida por e-mail. Sem integração de e-mail nesta versão.

O trabalho pode acontecer em paralelo. Arraste um cartão ou edite sua situação para movimentá-lo sem passagem obrigatória pelas outras colunas. Ao arrastar para Concluídos, o formulário de validação abre antes de aplicar a conclusão. O progresso exibido corresponde à proporção de atividades concluídas com validação registrada; cada checklist tem seu próprio progresso.

O projeto inicial de Quatro Barras é uma demonstração baseada no fluxo fornecido. Crie seu município para começar com um quadro vazio. Os dados ficam separados por município.

## Dados e limitações

Os dados ficam em `localStorage` no navegador que acessa o site, vinculados ao endereço/origem. Não há servidor de dados, contas ou sincronização entre usuários nesta versão. Publicar os arquivos do site não compartilha os dados cadastrados entre computadores.

Use **Dados e backup** para exportar ou restaurar um arquivo JSON. A restauração pede confirmação e substitui os dados atuais. O backup pode conter contatos e CPF; conserve-o em um local com acesso restrito. O CPF fica mascarado na visualização e pode ser editado no formulário.

Os cadastros e backups da versão anterior são migrados sem apagar atividades, notas, datas, checklists, números de chamados ou histórico. Pendências e agendas antigas passam para A fazer, mantendo as datas; antigos cartões de Chamados passam para Aguardando retorno com etiqueta Chamado. Conclusões antigas permanecem na coluna, com o aviso “Validação não registrada” se não houver aceite. A migração não inventa evidências ou nomes de validadores.

Para uso compartilhado na empresa, uma etapa posterior precisa adicionar autenticação, banco de dados e controle de acesso. Não cadastre dados reais sensíveis em uma publicação aberta sem esse controle.

## Validação

```sh
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
npm run build
```

Os testes de domínio cobrem movimentação livre, validação obrigatória na conclusão, reabertura, histórico, checklists, migração de versões, filtros e integridade do backup. Os testes no navegador cobrem tela inicial, cadastro, edição, persistência, treinamentos, exportação/restauração, anexos, migração, troca de visualização, calendário, navegação móvel e falhas de armazenamento.

Se não houver Chromium instalado, instale o navegador do Playwright com `npx playwright install chromium` e execute `npm run test:e2e` sem a variável acima. O arquivo de configuração inicia o servidor de desenvolvimento automaticamente quando necessário.
