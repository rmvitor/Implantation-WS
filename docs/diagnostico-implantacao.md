# Diagnóstico e implantação em etapas — 09/10/2026

## Constatações no código antes das mudanças

- `src/styles.css`: `.kanban-column` tinha apenas `min-height: 410px`; `.column-cards` não tinha limite nem `overflow-y`. Uma coluna crescia conforme seus cartões.
- `src/BoardScroller.jsx`: existia rolagem horizontal espelhada e durante o arraste, mas não rolagem vertical das listas. Isso deve ser preservado e ampliado.
- `src/team-service.js`: já existiam comparação por versão, transação e merge de três versões. `src/team-domain.js` já bloqueava alterações concorrentes no mesmo campo e exclusões de itens alterados. Não foi confirmado que o fluxo atual sobrescreve silenciosamente as alterações dos colegas.
- Entretanto, `implanta_projects.data` e `implanta_save_project` guardavam e substituíam todo o município, incluindo arrays de tarefas, capacitações e histórico. Isso aumenta a unidade de gravação e dificulta consultas entre municípios.
- `src/HandoffFields.jsx`: nome e data da validação eram digitados. `saveActivity` usava relógio do navegador. A tabela `implanta_audit` já registrava autor autenticado e horário do banco por alteração do projeto; faltava detalhamento por registro e sua apresentação na aplicação.
- Havia campos de contexto/próxima ação por tarefa, mas não registros próprios de passagem do município, modelos reutilizáveis ou boletim consolidado.
- `src/main.jsx`: exportava todo o workspace, incluindo CPF e anexos. A máscara de visualização não protegia o conteúdo baixado ou recebido pelo navegador.
- A conexão padrão usa uma chave **publicável**, esperada no cliente Supabase. `validateConnection` já recusa `sb_secret_` e JWT `service_role`. Não foi encontrada chave privada no código da aplicação. Chaves privadas não devem ser adicionadas ao frontend nem às variáveis VITE.

## Decisões confirmadas pelo usuário

- Prazo próximo: até **1 dia**, incluindo hoje; vencido é uma categoria separada.
- Chamado parado: **5 dias** sem atualização, quando está em Aguardando. Limites editáveis.
- Consulta de CPF: administradores e editores com acesso ao município; leitura não recebe o campo na nova API.
- Exportação com CPF completo: **somente administradores autenticados**. Exportação comum sem CPF.

## Ordem das entregas

1. Colunas com altura limitada ao viewport, listas independentes, cabeçalhos e ações fora da área que rola. Cartões não encolhem e títulos longos quebram linha. Preservar rolagem horizontal e acrescentar rolagem vertical no arraste.
2. Registros vinculados por município para dados cadastrais, atividades, chamados, contexto/passagens, capacitações, homologação e histórico. Gravar somente registros alterados, com versão e transação. Identidade e horário da conclusão verificados no servidor e auditoria detalhada.
3. Visão Ação agora, modelos definidos pelo usuário, passagens de trabalho, comparação de municípios e boletim com período escolhido. Relatórios abrangem somente municípios liberados à conta.
4. Verificações, publicação do cliente compatível e ativação separada da migração no Supabase.

## Estratégia de migração segura

- Publicar primeiro um cliente que reconheça a estrutura nova e continue atendendo ao banco anterior enquanto a migração não está aplicada.
- Fazer uma cópia de segurança administrada do banco no Supabase e validar a restauração antes da ativação. Um JSON comum sem CPF não substitui esse backup do banco.
- Aplicar o novo SQL em uma transação: adicionar tabelas e políticas, copiar registros mantendo IDs, conteúdo e datas históricas, conferir contagens e reconstrução. Nenhuma exclusão da tabela antiga.
- CPF passa a ter armazenamento privado. Administradores e editores autorizados consultam o valor completo; usuários de leitura não o recebem pela nova API. O nome e o horário da validação de registros antigos são preservados como históricos, sem inventar autoria autenticada.
- Após ativação, clientes antigos devem atualizar antes de gravar. Não manter duas fontes graváveis em paralelo. Abrir janela de ativação com colegas fora das edições e conferir leitura, edição, permissões e relatórios após o corte.
- A reversão precisa reconstruir os JSONs da estrutura nova, incluindo alterações posteriores ao corte, antes de voltar ao protocolo antigo. A tabela antiga preservada representa a fotografia anterior à migração, não um espelho atualizado.
- Não executar o SQL de produção automaticamente com a chave publicável. Ativação e backup administrado exigem acesso ao painel/banco Supabase.

## Decisões e limites que não serão inventados

- Modelos são preenchidos pelo usuário: nenhum módulo, prazo, entidade ou tarefa obrigatória é criado automaticamente.
- O boletim tem período escolhido e edição do texto. Não há envio automático, destinatário inventado ou classificação automática de riscos como regra da empresa.
- Novos campos estruturados não tornam todo o contexto obrigatório: a equipe pode registrar as informações disponíveis e completá-las depois.
- Dados pessoais em texto livre e arquivos exigem revisão: o backup comum omite anexos e mascara padrões de CPF, sem afirmar anonimização completa de documentos arbitrários.
- A operação local não comprova identidade autenticada nem horário de servidor; essa diferença deve ficar explícita.

## Implementação entregue

Versão 1.11.0: etapas 1–3 implementadas no cliente; migração 202610090002_records.sql preparada, exercitada em banco descartável e pendente de ativação em produção. Ver [guia, testes manuais e recuperação](migracao-registros.md). Nenhum dado de produção foi apagado ou convertido durante o desenvolvimento.
