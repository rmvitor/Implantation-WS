# Histórico de versões

## 1.18.0 — 27/10/2026

- Filtro Apenas meus nas atividades, por ID da conta responsável, nas quatro visualizações. Preferência local por conta e município, combinada com os filtros existentes, sem gravação no banco.
- Responsável escolhido entre usuários ativos com edição efetiva no projeto, incluindo gestor e Master. Troca preserva a autoria; atividades criadas diretamente, por modelos ou pela homologação começam com a conta atual.
- Novo SQL aditivo registra o criador no servidor, recupera autores conhecidos e vincula os nomes antigos quando não há ambiguidade. Atividades sem responsável recebem o criador elegível; sem criador identificável ou com edição, o gestor atual assume, sem alterar a autoria. Quando nem o gestor é elegível, a escolha é manual. Dados anteriores e histórico preservados. Validações também no banco e proteção contra retirada de edição enquanto houver atividades atribuídas.

## 1.17.2 — 26/10/2026

- Entrada do portal orientada ao link dos e-mails padrão do Supabase, sem exigir edição dos templates ou código numérico. Solicitação de novo link em primeiro plano, código opcional recolhido e mensagens de convite/reenvio atualizadas.
- Erros de retorno do e-mail agora são exibidos na tela, inclusive link vencido, permitindo solicitar outro acesso. Validado o primeiro acesso e o Magic Link em outro navegador, sem verificador do técnico ou alteração da sessão interna.
- Guia revisado com Site URL/Redirect URLs e recuperação de links que voltam para localhost ou para o login da equipe. O SQL existente e os limites dos convites permanecem válidos; sem novo SQL.

## 1.17.1 — 26/10/2026

- Convites cujo nome, cargo ou e-mail foram alterados deixam de oferecer o link e o reenvio antigos na tela. É necessário gerar um novo convite para o cadastro atual; os aceites anteriores continuam preservados. Usa o mesmo SQL do portal da versão 1.17.0.

## 1.17.0 — 26/10/2026

- Portal opcional do cliente no Aceite da implantação: convite por responsável, módulo e entidade, validade de 7 dias, código de acesso enviado pelo Supabase Auth com o SMTP existente, reenvio, renovação e revogação. Contas externas não recebem acesso à plataforma ou aos projetos.
- Técnico define os responsáveis de cada ponto sem registrar aceite em nome deles; atribuição automática quando há uma única pessoa. O cliente vê somente seus pontos apresentados e confirmados, com atualização automática, e registra seu próprio OK diretamente no banco com controle de versão, autor e horário. Aceites internos continuam disponíveis.
- Termo final por módulo no mesmo modelo, com timbre e assinaturas; identidade do cliente preservada e distinguida do técnico. Novo SQL aditivo 202610260003 e dois modelos de e-mail para ativação no Supabase; guia em docs/portal-cliente.md.

## 1.16.1 — 26/10/2026

- Novas atividades recebem o usuário conectado como responsável inicial, com possibilidade de edição antes de salvar. O padrão também se aplica a modelos sem responsável definido e a pendências criadas pela homologação. Atividades existentes conservam o responsável atual. Sem novo SQL.

## 1.16.0 — 26/10/2026

- Aceite do cliente como flag após o técnico, com escolha de responsáveis quando houver vários. O cliente exige aceite técnico e bloqueia alterações que o invalidariam até a retirada do aceite do cliente. Não e Não se aplica são exclusivos e não aceitam confirmações.
- Não se aplica justificado dispensa o ponto sem aceites. Não continua bloqueando apresentações; perguntas de impedimento conservam o sentido do modelo. Validação também no servidor.
- Filtros locais por situação dos aceites, ações gerenciais em uma linha com rolagem no celular, limpeza do relatório no banco com confirmação e preservação dos demais relatórios e documentos.
- Cabeçalho e rodapé com o padrão visual de referência; assinaturas preservadas. SQL 202610260001 atualiza as regras e arquiva as confirmações antigas incompatíveis sem alterar termos emitidos.

## 1.15.1 — 26/10/2026

- Preenchimento compacto dos aceites sem dropdown: Sim do técnico registra resposta e aceite em um clique; Não e Não se aplica abrem a justificativa, com escolhas exclusivas. Observações recolhidas nas demais respostas.
- Rodapé dos documentos em texto, sem as linhas verticais da imagem antiga, preservando os dados institucionais. Relatórios parciais também possuem página de assinaturas com técnicos identificados e todos os responsáveis cadastrados no módulo.
- Mantidos salvamento automático, autoria autenticada, seleção do cliente, dispensas e bloqueios do termo. Sem alteração de estrutura ou novo SQL.

## 1.15.0 — 24/10/2026

- Aceites com visão geral, abas por entidade/módulo, preenchimento direto e salvamento automático serializado. Últimas abas e recolhimento ficam somente neste aparelho, por conta e projeto.
- Seleção automática do cliente único, seleção em janela quando há vários e aviso para cadastro quando não há responsáveis. Cadastro por abas com botão e confirmação de exclusão.
- Dispensa justificada para pontos respondidos Não que não serão utilizados/apresentados, mantendo os dois OKs. Impressão parcial e termos finais por módulo; consolidado por entidade preservado.
- Modelos globais e atualização de perguntas exclusivos do Master, com revisão e bloqueio no banco. Módulos sem modelo ficam indisponíveis para nova contratação; seleção em lote dos módulos disponíveis.
- Desativar relatório ou desmarcar contratação pede confirmação e limpa o preenchimento ativo; histórico e termos emitidos preservados. SQL único 202610240003 para ativar registros separados e novos aceites, preservando dados e acessos, com bloqueio de escritas durante a cópia e transação atômica. Alternativa 202610240002 para quem já usa registros separados; aplicação administrativa necessária.

## 1.14.0 — 24/10/2026

- Nova área Aceite da implantação, independente da conferência dos dados migrados. Escopo por módulo e entidade, com 94 perguntas dos modelos IPM 2026-3 de Frota, Compras e Contratos, Almoxarifado e Patrimônio; perguntas personalizáveis sem modificar os padrões ou outros projetos.
- Responsáveis com nome/cargo por módulo e por ponto; OK técnico e registro do aceite informado por cada responsável durante a reunião. Usuário autenticado e horário são atribuídos pelo servidor. Impedimentos, capacitação pendente e aceites incompletos bloqueiam o termo.
- Emissão por entidade com cópia preservada dos dados, nomes/cargos para assinatura e timbre IPM dos arquivos fornecidos. Impressão/Salvar PDF e arquivo HTML com imagens incorporadas. Mudanças exigem nova conferência; termos anteriores permanecem disponíveis.
- Migração aditiva compatível com o banco atual e com registros separados por pergunta, preservando dados, permissões, homologação da migração e documentos anteriores. A rotina online exige executar o novo SQL; a publicação não altera o banco automaticamente. Restaurações identificam aceites importados para reconferência.

## 1.13.1 — 16/10/2026

- Descrição do backup completo alinhada abaixo do título, com quebra de linha no espaço disponível, inclusive no celular.

## 1.13.0 — 15/10/2026

- Níveis Master, Gestor do projeto, Editor e Visualizador. Após a aprovação inicial pelo Master, colegas podem criar municípios e gerenciar os acessos aos próprios projetos, sem acesso global ou promoção pelo navegador.
- Gestão do projeto por busca exata de e-mail, concessão/revogação de Leitura/Edição, transferência de gestor pelo Master e histórico de contas/acessos com autor e horário do servidor. Perfil e cartões identificam o nível em cada projeto.
- Migração aditiva mantém autoria, dados, versões e concessões existentes, suporta os dois protocolos de banco e conserva a aprovação de contas pelo dono da plataforma. A publicação do app não aplica o SQL; o comportamento anterior permanece até a ativação administrativa descrita em docs/niveis-acesso.md.

## 1.12.3 — 15/10/2026

- Removida a rotina de e-mail e seus arquivos, dependências, testes específicos e documentação. A atualização limpa os identificadores locais usados pela rotina descontinuada, preservando projetos, preferências, autenticação e dados das outras aplicações na mesma origem.

## 1.11.4 — 12/10/2026

- Botão Voltar do Android e do navegador fecha primeiro janelas, confirmações e menus; depois retorna entre as áreas e municípios visitados, até a tela inicial. Navegação do PWA usa o histórico nativo, mantendo a URL e o escopo da instalação.
- Salvar, cancelar e fechar menus não deixam etapas vazias no retorno. Avançar restaura telas, sem reabrir formulários já encerrados nem executar novamente alterações no banco.
- Histórico guarda somente identificadores de tela/projeto, separado por conta; não inclui cartões, rascunhos, senhas ou dados pessoais. Projetos removidos ou revogados não são reconstruídos pelo histórico. Retornar a um município não grava preferências nem altera seus registros.
- Retorno bloqueado enquanto uma gravação, troca de senha ou operação administrativa estiver em andamento. Na tela inicial, sem janela/menu aberto, o comportamento de saída permanece com o Android/navegador. Não exige novo SQL.

## 1.11.3 — 11/10/2026

- Equipe e acessos com resumo, busca por nome/e-mail e filtros por situação e projeto. Cada usuário permite expandir os municípios e consultar ou alterar Leitura/Edição/Sem acesso; a visão por projeto também mostra administradores com acesso total.
- Perfil e Equipe e acessos mostram os projetos liberados para a conta e permitem alterar a própria senha pelo Supabase Auth, com confirmação da senha e suporte ao código de reautenticação quando exigido pelo servidor. Senhas não entram em preferências, projetos ou backups.
- Administradores podem solicitar recuperação de senha por e-mail, com confirmação do destinatário. A recuperação não libera contas nem modifica permissões. Aprovação, desativação, administração e liberações continuam exclusivas do ADM, com as restrições existentes no banco.
- Layout compacto e responsivo; filtros e alterações de acesso preservam rascunhos de usuário ainda não salvos. Falhas mostram erro e conservam os dados anteriores. Não exige novo SQL. Envio real dos e-mails depende da configuração de autenticação do Supabase.

## 1.11.2 — 11/10/2026

- Criação, edição, exclusão e movimentação atualizam o app atual assim que o banco confirma o salvamento, sem esperar uma segunda consulta.
- Consultas de sincronização iniciadas antes de um salvamento são descartadas se chegarem depois, evitando que dados antigos façam tarefas recém-salvas desaparecer da tela.
- No banco com registros separados, a tela usa diretamente a resposta da transação, preservando usuário e horário da validação definidos pelo servidor. O formato anterior usa o conteúdo combinado e confirmado pelo controle de versão.
- Falhas mantêm o formulário e não apresentam alterações como salvas. Preferências de visualização continuam locais; esta correção não exige novo SQL.

## 1.11.1 — 11/10/2026

- Rolagem horizontal do quadro sem atualizações React a cada movimento e sem retorno de eventos entre as barras espelhadas, preservando gestos e inércia nativos.
- Mouse: roda na barra superior ou nos cabeçalhos navega entre fases; Shift + roda funciona sobre os cartões. A roda comum nas listas mantém a rolagem vertical, e o arraste continua rolando entre colunas.
- Quadro/Lista/Tabela/Calendário, fases recolhidas e ordenação ficam somente no navegador, por conta e município. Não gravam no Supabase nem entram nos backups de projetos, e cada aparelho pode manter escolhas diferentes.
- Preferências de visualização antigas do banco são ignoradas. Preferências do modo local anterior são preservadas neste navegador; não há alteração na estrutura do banco.

## 1.11.0 — Acompanhamento e registros separados

- Quadros com altura limitada à tela, rolagem vertical independente e cabeçalhos fixos; cartões longos quebram linha; rolagem horizontal e durante o arraste preservadas.
- Acompanhamento geral: Ação agora (1 dia / 5 dias, configuráveis), comparação de municípios, passagens estruturadas, modelos pessoais e boletim semanal revisável em Markdown.
- Validação online identifica a conta autenticada; histórico mostra autoria e permite consultar a auditoria do banco.
- Exportação comum omite CPF e anexos, mascara padrões de CPF em textos e preserva dados omitidos já existentes ao restaurar. Backup completo disponível apenas para administradores autenticados.
- Cliente compatível com banco atual e protocolo novo; migração aditiva separa municípios, atividades, contexto, chamados, passagens, capacitação, homologação e histórico. Versões por registro, transações e auditoria com usuário/horário do servidor.
- Migração preparada e validada em PostgreSQL descartável; ativação em produção depende de backup administrado, revisão e execução do guia no Supabase. Dados de produção não foram alterados automaticamente.

## 1.10.3 — 09/10/2026

- Logo Sofrimentação. aplicado no menu lateral e na tela de login, a partir da imagem fornecida.
- Fundo transparente e contraste em preto no tema claro e branco no tema escuro; marca responsiva no celular e computador.

## 1.10.2 — 09/10/2026

- Data de término opcional na agenda geral, vazia por padrão. Projetos e outros compromissos podem registrar apenas o início e completar o período depois.
- Sem término, o registro aparece como Término a definir, permanece na lista de próximos/em andamento e ocupa somente o dia inicial no calendário.
- Horário de término solicitado somente quando há uma data final; remover a data final limpa esse horário. Períodos existentes e backups continuam compatíveis.

## 1.10.1 — 09/10/2026

- Agenda geral posicionada após as ações dos projetos, com separador próprio e antes de Gerenciamento.
- Lista aparece primeiro e abre por padrão; calendário continua disponível na segunda opção.
- Botão de exclusão do compromisso usa o texto compacto Excluir, mantendo a confirmação.

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
