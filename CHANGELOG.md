# Histórico de versões

## 1.10.0 — 09/10/2026

- Agenda geral pessoal, disponível sem municípios, com calendário e lista de novos projetos, viagens, feriados municipais e compromissos pessoais.
- Registros previstos ou confirmados, períodos com início/término, dia inteiro ou horários, local livre e observações. Datas prováveis não criam nem alteram projetos.
- Busca, filtros, navegação por mês, edição e exclusão com confirmação. Períodos invertidos são bloqueados e falhas preservam o formulário.
- Dados guardados nas preferências privadas de cada usuário no Supabase; colegas e administradores não consultam a agenda de outras contas pelas permissões do sistema. Sem nova migração SQL.
- Agenda pessoal não aparece nas tarefas, indicadores, homologação ou histórico de municípios. Excluir, encerrar ou limpar projetos mantém seus compromissos pessoais.
- Backups incluem a agenda geral; importar backups antigos sem essa área conserva os compromissos atuais.

## 1.9.1 — 09/10/2026

- Tela inicial permite ordenar os cards de projetos manualmente por arraste ou botões de mover antes/depois, inclusive no celular.
- Ordem salva automaticamente por usuário, incluída nos backups e usada também no seletor rápido de municípios.
- Filtros e projetos encerrados preservam a preferência; projetos novos entram no fim e exclusões removem apenas o ID correspondente da ordem.
- Alterações de ordem não editam os dados compartilhados dos municípios e falhas de salvamento mantêm a ordem anterior. Não exige migração SQL.

## 1.9.0 — 09/10/2026

- Nome do projeto em destaque em todas as áreas, com cor própria no cabeçalho, no seletor lateral e nos cards da tela inicial. A cor é configurável nos dados do município e não altera o tema do perfil.
- Troca rápida de projetos ativos na seta do bloco lateral, com suporte a teclado e preservação da área em uso. Projetos encerrados ficam fora da lista.
- Nome do município também identifica a aba do navegador. Projetos antigos recebem cor automática estável, sem alterar seus registros.
- Lista lateral de municípios substituída pelo separador estático Gerenciamento; criação e gestão continuam na tela inicial.
- Equipe e acessos organizada em abas, com linhas compactas para usuários e permissões. Rascunhos são mantidos ao alternar entre abas.
- Cor do projeto preservada em backups e no banco compartilhado, com validação dos valores importados. Não exige migração SQL.
- Foco inicial dos formulários aplicado sem atraso, para não interromper a edição rápida de outro campo.

## 1.8.2 — 09/10/2026

- Bloco do projeto ativo na barra lateral mostra somente o nome do município, sem subtítulo e sem seta para baixo.

## 1.8.1 — 09/10/2026

- Capacitação incluída na barra de navegação do projeto e nas ações rápidas do município, para acessar treinamentos e atendimentos remotos.
- Navegação mantém a área atual visível na rolagem horizontal do celular, inclusive ao acessar pelo menu lateral.
- Conexão pública padrão do Supabase conferida com a URL e a chave publicável informadas, mantendo as configurações específicas já salvas no aparelho.

## 1.8.0 — 09/10/2026

- Barra de navegação do projeto disponível em Atividades, Homologação, Agenda e Histórico, com área atual marcada e layout em uma linha no celular.
- Perfil oferece Finalizar sessão para retornar ao login e retirar os dados online da tela. Encerra a sessão deste aparelho e descarta a prévia de aparência não salva.
- Lista permite recolher fases individualmente ou em conjunto, com resumos e a mesma preferência do quadro por município.
- Encerrar, reabrir e excluir projeto ficam nos dados do município e nos cards da tela inicial.
- Cabeçalho lateral mostra o nome do projeto selecionado. Botões de adicionar ficam dentro das fases, inclusive recolhidas.
- Cards de município abrem ações rápidas por botão direito, Shift+F10 ou botão de três pontos. Consulta, edição e ciclo do projeto respeitam permissões e confirmações existentes.

## 1.7.1 — 09/10/2026

- Tema claro com texto e destaques mais fortes, superfícies neutras e navegação marcada por variações da cor escolhida no perfil.
- Cor inicial azul; preferências de cor já salvas são mantidas. Avisos e fundos deixam de depender da antiga base verde; True Black preservado.
- Menu lateral usa “Capacitação e suporte” e remove o bloco “Menos burocracia”.
- Corrigida a exclusão de cartões online: comparação ignora a ordem das propriedades JSONB e normaliza campos opcionais antes de conferir alterações concorrentes.
- Exclusão confirmada pelo banco preserva histórico e alterações independentes; falhas de conexão e edições simultâneas do mesmo cartão conservam o formulário.

## 1.7.0 — 09/10/2026

- Agenda Treinamento/Atendimento com tipo de encontro, início e término por data e horário, duração calculada e link da sala.
- Salas de atendimento podem ocupar vários dias; calendário e agenda de hoje acompanham todo o período, incluindo encontros iniciados antes de hoje.
- Histórico conserva os períodos de cada alteração; backups preservam os novos campos e os treinamentos anteriores.
- Término precisa ser posterior ao início. Durações antigas reconhecidas ajudam a preencher o término ao editar, sem alterar cadastros automaticamente.
- Verificada a existência da tabela de projetos e da função de acesso no Supabase, com acesso anônimo protegido.

## 1.6.1 — 09/10/2026

- Conexão pública padrão do Supabase na publicação e login ao abrir o site.
- Exportação de dados locais anteriores na tela de login, para importação explícita pelo administrador.
- Guia de ativação acessível quando falta a estrutura do banco.
- Verificação da conexão pública durante a publicação, sem criar contas ou enviar e-mails.

## 1.6.0 — 09/10/2026

- Controles compactos do quadro, visualizações em uma linha e recolhimento pelo nome da fase.
- Integração Supabase com login, aprovação de usuários, administração e acesso de leitura/edição por projeto.
- Gravação confirmada, controle de versão, combinação de alterações independentes e conflitos preservando o formulário.
- Estrutura do banco e testes de permissões PostgreSQL; projetos começam vazios.

## 1.5.0 — 09/10/2026

- Fases do quadro podem ser recolhidas individualmente ou em conjunto, mantendo resumos de atividades, prioridades altas, atrasos, chamados e validações. Preferência salva por projeto e incluída no backup.
- Barra superior de rolagem nativa com o mesmo visual da inferior e posição sincronizada nos dois sentidos.
- Atalhos por botão direito nos cartões, lista, tabela e calendário; no quadro, botão de três pontos para toque e Shift+F10 para teclado. Situação e prioridade usam os mesmos registros de histórico e regras de validação.
- Salvar/criar no cabeçalho fixo do formulário da atividade, mantendo a validação dos campos e a proteção durante leitura de anexos.
- Checklists aparecem antes do contexto de continuidade. Campo Atividades executadas preservado na atividade, no histórico e no backup.
- Número, situação na fábrica e link do chamado aparecem somente na categoria Chamado. Trocar a categoria preserva os valores para eventual retorno.
- CPF com asteriscos na visualização e olhinho para revelar/ocultar; volta a ficar oculto ao sair da tela. Botão Excluir com texto no cabeçalho do município.

## 1.4.0 — 09/10/2026

- Primeiro acesso sem projetos de demonstração, com cadastro e importação disponíveis na tela inicial.
- Encerramento de projetos com preservação de tarefas, homologação e histórico; aba Encerrados e opção de reabertura.
- Exclusão de projeto e limpeza do workspace local com confirmação explícita e opção de exportar backup antes.
- Backups aceitam workspace vazio e incluem os projetos encerrados. Atualizações preservam cadastros anteriores.
- Conversor de JSON do Trello para o formato de importação existente, com números, prioridades, checklists, datas, histórico e homologação por módulo e entidade. Marcações antigas não inventam aceites formais.

## 1.3.0 — 09/10/2026

- Instalação como PWA no celular e no PC, com manifesto, ícones de app/maskable/Apple e instruções para Android, iOS e desktop.
- Acesso offline após a primeira abertura e atualização de versão disponível sem recarregar formulários abertos ou apagar cadastros locais.
- Tela própria de homologação dos dados migrados, com configuração de módulos e entidades por projeto, incluindo os casos que não migram.
- Rotinas de comparação ajustáveis, OKs com responsável/data/referência, divergências e geração opcional de pendências vinculadas no quadro.
- Liberação por módulo conforme os OKs das entidades e liberação geral com registro no histórico. Mudanças de escopo, entidades ou conferências reabrem a liberação.
- Backup inclui o escopo da migração, os registros de conferência e a liberação. Cadastros anteriores são preservados sem inventar OKs.

## 1.2.0 — 09/10/2026

- Rolagem horizontal do quadro com barra, botões e navegação por teclado, incluindo telas menores.
- Cor principal personalizável no perfil e tema escuro True Black; preferências salvas no navegador e incluídas no backup.
- Módulos de Suprimentos: Compras e Contratos, Almoxarifado, Patrimônio, Frota, Fiscalização de contrato e Elicita. Nomes antigos conhecidos são atualizados sem apagar atividades.
- Categorias independentes da situação: Chamado, Tarefa, Agenda e Pendência.
- Prioridade exibida junto ao módulo; ordenação por prioridade preservada por município, disponível no quadro, na lista e na tabela.
- Número do chamado disponível no formulário e exibido após o texto da atividade.
- Movimentação com indicação de destino e animação; situação e histórico atualizados juntos, respeitando a preferência de movimento reduzido.
- Versão no rodapé, vinculada à versão do pacote.

## Versão inicial

- Tela inicial com municípios e cadastro de projetos.
- Quadro, lista, tabela e calendário com agenda separada de treinamentos.
- Checklists por entidade, contexto para passagem de trabalho, evidências e validação de conclusão.
- Histórico de execução e backup local com migração de cadastros anteriores.
