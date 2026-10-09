# Ativação revisada dos registros separados

A versão 1.11.0 já reconhece os dois formatos. Publicar o site **não executa a migração**. Até ativá-la, continuam as versões e o merge do banco antigo, e o CPF ainda existe no JSON acessível aos usuários autorizados. Ocultar o campo na interface não muda essa exposição na API antiga.

## Preparar antes do corte

1. Conferir o [diagnóstico](diagnostico-implantacao.md). Consulta de CPF já confirmada: administradores e editores com acesso ao município. Exportação completa permanece exclusiva de administradores. Confirmar com a empresa retenção de histórico, contatos, CPF e anexos. Não há descarte automático.
2. Fazer backup administrado de **todo o banco** pelo Supabase/PostgreSQL, incluindo `public`, `implanta_private`, usuários, vínculos e preferências. Proteger esse backup; ele contém CPF. O JSON comum da aplicação é reduzido e **não substitui** um backup completo do banco.
3. Restaurar a cópia em um projeto de homologação. Registrar contagens de municípios, tarefas, capacitações, histórico e escopo de migração; comparar também conteúdo, IDs, chamados, checklists, anexos e aprovações. Testar com dados reais exige ambiente restrito às pessoas autorizadas.
4. Abrir janela curta sem edições. Pedir aos colegas que salvem e fechem formulários, confirmem a atualização do PWA e vejam v1.11.0 ou posterior no rodapé.

## Aplicar uma vez em homologação, depois em produção

O banco original precisa ter `202610090001_implanta.sql` aplicado. **Não reaplicar esse arquivo em um banco existente.**

No SQL Editor do projeto de homologação, executar [202610090002_records.sql](../supabase/migrations/202610090002_records.sql). A transação cria tabelas, transfere os dados, valida contagens e muda as permissões. Duplicidades, dados incompatíveis ou falhas abortam a transação. Se o editor deixar a sessão em transação abortada, executar `rollback;` antes de investigar/repetir. Não ignorar erros nem editar/remover registros antigos para fazer o SQL passar sem diagnóstico.

Após testar/restaurar e revisar os resultados, executar o mesmo arquivo **uma vez** em produção. Essa etapa exige o painel ou uma conexão administrativa ao banco; a chave publicável enviada para o site não autoriza a execução. Nenhuma chave privada deve ir para variáveis VITE, Git ou o navegador.

Tabelas novas: `implanta_municipality_records`, `implanta_activity_records`, `implanta_ticket_records`, `implanta_context_records`, `implanta_handover_records`, `implanta_training_records`, `implanta_history_records`, `implanta_homologation_records`, `implanta_conference_records`. CPF cadastral fica em `implanta_private.implanta_personal_records`, sem SELECT direto na API; a leitura controlada entrega o valor a administradores e editores do respectivo município, e a gravação verifica a mesma permissão; auditoria imutável em `implanta_record_audit`.

Cada linha tem vínculo ao município e revisão. Contexto/chamado têm também chave estrangeira para a atividade. O cliente envia somente linhas alteradas e versões esperadas, dentro de uma transação. O banco verifica permissões, concorrência, autor, hora e evidência de conclusão. Registros importados ficam identificados como históricos sem autoria autenticada comprovada; autor e datas antigos não são inventados ou reescritos como uma nova aprovação.

A tabela `implanta_projects` continua como registro de vínculos/versões e fotografia anterior ao corte. Seu JSON não recebe novas tarefas. Acesso direto ao JSON antigo é retirado, pois contém CPF; gravações do protocolo antigo são bloqueadas com mensagem de atualização. CPF não vai para a auditoria como valor anterior/novo; ficam somente os nomes dos campos alterados.

## Conferir após ativar

- **Equipe e acessos** deve indicar registros separados e validação no servidor ativos.
- Entrar com administrador, editor e usuário de leitura, usando contas diferentes. Conferir projetos autorizados, edição e ações de encerrar/excluir. Verificar o CPF conforme a política de consulta aprovada; backup completo somente no administrador.
- Editar tarefas diferentes em duas contas. Depois editar campos diferentes da mesma tarefa; ambos devem permanecer. Editar o mesmo campo em ambas: a segunda gravação deve manter o formulário e informar o conflito.
- Tentar excluir uma tarefa que o colega alterou enquanto a confirmação estava aberta. A exclusão não pode apagar a nova alteração silenciosamente.
- Concluir uma atividade com critério e evidência; conferir autor e horário em **Histórico → Alterações do banco**. Conferir OK e liberação por módulo/entidade.
- Testar Agenda geral, capacitação, arraste, lista/tabela/calendário, importação, PWA e encerramento/reabertura com projetos de homologação.
- Comparar conteúdo com a cópia: mesmas identificações, tarefas, chamados, checklists, arquivos, registros históricos e homologação. Datas de atualização desconhecidas continuam desconhecidas, e aparecem separadas dos chamados comprovadamente parados.

## Recuperação

Se o SQL falhar antes de `commit`, a transação não muda a estrutura antiga. Se houver problema após o corte, suspender edições e preservar uma cópia **atual** do banco novo. Preferir corrigir o cliente/SQL mantendo os registros separados.

Para retornar ao protocolo antigo depois de novas edições, é necessário reconstruir os JSONs de todos os municípios a partir das novas tabelas, incluindo contexto, chamados, histórico, anexos, homologação e CPF privado, conferir conteúdo e versões e restaurar as funções/permissões do protocolo antigo em uma transação. Testar essa reversão na cópia antes de executá-la. A fotografia antiga isolada **não contém** alterações feitas após o corte; restaurá-la sozinha perderia trabalho. Não há botão de reversão automática.

## Uso das novas telas

Na lateral, abrir **Acompanhamento geral**:

- **Ação agora:** vencidas, vencendo hoje/até 1 dia e chamados em Aguardando sem atualização há 5 dias. Limites pessoais editáveis; prazos são dias corridos, sem calendário de expediente inventado. Sem data conhecida de atualização, o chamado aparece como “Sem atualização registrada”.
- **Municípios:** compara atividades validadas e conferências da migração separadamente, além de ações imediatas e próximo passo. Sem percentual único com pesos inventados.
- **Passagem de trabalho:** registra situação, pendências, próximo passo, responsável e riscos opcionais; novas passagens preservam as anteriores.
- **Modelos:** modelos da conta, aplicáveis a municípios novos ou existentes. Nenhum padrão obrigatório da empresa é criado; compartilhamento institucional de modelos depende de decisão da equipe.
- **Boletim semanal:** avanços no intervalo escolhido e situação atual de pendências/riscos/próximos passos. Revisável antes de baixar; não envia mensagens ou e-mails automaticamente.

O backup comum remove CPF cadastral/anexos e mascara padrões de CPF nos textos. Outros dados pessoais, links e conteúdo livre precisam de revisão antes de compartilhar. Ao restaurá-lo sobre o mesmo município/tarefa, CPF e anexos já existentes são mantidos. Em uma conta/dispositivo sem esses dados, continuam ausentes.

## Verificação técnica repetível

`npm test`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`, `npm run build`. `npm run test:db` cria/remove uma base de teste isolada; configurar `IMPLANTA_TEST_DATABASE_URL` apontando **somente** para PostgreSQL descartável. O teste verifica a estrutura antiga, aplica a migração com fixtures e exercita também o cliente real de registros contra PostgreSQL. Nunca usar banco de produção para fixtures.
