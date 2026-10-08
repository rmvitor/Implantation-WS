# Implanta

Workspace em português para organizar a implantação de sistemas em municípios. Feito com React e Vite, com interface responsiva e fontes hospedadas junto ao site.

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

- **Municípios:** nome, UF, código no Dream, fiscal do contrato, CPF, e-mail e contato para chamados. Entidades configuráveis por projeto.
- **Homologação:** atividades por módulo, com um checklist independente para cada entidade. Itens podem ser adicionados, marcados ou removidos.
- **Agenda:** compromissos, prazos e treinamentos por data. Atividades na etapa Agenda exigem data; os demais prazos são opcionais.
- **Pendências:** demandas que precisam ser executadas, com responsável, prioridade e notas.
- **Chamados:** número do chamado e situação da demanda na fábrica. O cadastro é local, sem envio automático à fábrica.
- **Concluídos e histórico:** atividades finalizadas e registro automático de criação, edição, movimentação, exclusão e conclusão. Uma atividade pode ser reaberta.
- **Treinamentos:** agenda própria, cadastrada manualmente a partir da programação recebida por e-mail. Sem integração de e-mail nesta versão.

As etapas podem acontecer em paralelo. Arraste um cartão ou edite sua etapa para movimentá-lo sem passagem obrigatória pelas outras colunas. O progresso exibido corresponde à proporção de atividades concluídas; cada checklist tem seu próprio progresso.

O projeto inicial de Quatro Barras é uma demonstração baseada no fluxo fornecido. Crie seu município para começar com um quadro vazio. Os dados ficam separados por município.

## Dados e limitações

Os dados ficam em `localStorage` no navegador que acessa o site, vinculados ao endereço/origem. Não há servidor de dados, contas ou sincronização entre usuários nesta versão. Publicar os arquivos do site não compartilha os dados cadastrados entre computadores.

Use **Dados e backup** para exportar ou restaurar um arquivo JSON. A restauração pede confirmação e substitui os dados atuais. O backup pode conter contatos e CPF; conserve-o em um local com acesso restrito. O CPF fica mascarado na visualização e pode ser editado no formulário.

Para uso compartilhado na empresa, uma etapa posterior precisa adicionar autenticação, banco de dados e controle de acesso. Não cadastre dados reais sensíveis em uma publicação aberta sem esse controle.

## Validação

```sh
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
npm run build
```

Os testes de domínio cobrem movimentação livre, conclusão/reabertura, histórico, checklists por entidade, filtros e integridade do backup. Os testes no navegador cobrem cadastro, edição, persistência após recarga, treinamentos na agenda, exportação/restauração e navegação móvel.

Se não houver Chromium instalado, instale o navegador do Playwright com `npx playwright install chromium` e execute `npm run test:e2e` sem a variável acima. O arquivo de configuração inicia o servidor de desenvolvimento automaticamente quando necessário.
