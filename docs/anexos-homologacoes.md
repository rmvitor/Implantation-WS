# Responsável e anexos das homologações — v1.21.1

O painel **Responsável e anexos** aparece na conferência de dados migrados (ao abrir um módulo/entidade) e no relatório de cada módulo/entidade dos **Aceites da implantação**. São recursos independentes: um anexo da migração não aparece no aceite, nem em outro módulo, entidade ou município.

## Ativação no Supabase

1. No projeto Supabase da equipe, faça uma cópia de segurança do banco.
2. Abra **SQL Editor → New query**, cole todo o arquivo [`202611160001_homologation_resources.sql`](../supabase/migrations/202611160001_homologation_resources.sql) e clique em **Run**.
3. Execute também [`202611160002_homologation_validator.sql`](../supabase/migrations/202611160002_homologation_validator.sql) para que o responsável da migração seja usado em **Validado por**. Quem já aplicou o primeiro SQL precisa executar somente esse complemento.
4. Atualize o Implanta e abra uma homologação. Não é necessário configurar chaves privadas no site nem criar outro servidor.

Requer os registros separados, níveis de acesso e a homologação da implantação já usados pelo sistema (`202610090002`, `202610150001` e `202610240001`, com a ativação v2 posterior quando aplicável). A migração cria tabelas próprias e o bucket **privado** `homologation-attachments`, com limite de **15 × 1024 × 1024 bytes** por arquivo. Pode ser reaplicada sem apagar os arquivos ou as escolhas existentes. Não remove nem modifica projetos, respostas, assinaturas ou OKs.

Se o SQL ainda não estiver ativo, o painel mostra o guia e as conferências anteriores continuam disponíveis. Sem conexão da equipe, os campos antigos continuam funcionando, e o painel explica que responsável/anexos compartilhados exigem o modo online.

## Responsável

Na migração, escolha a conta em **Validado por** e salve a conferência; essa escolha também define o responsável. Nos aceites da implantação, use **Salvar responsável** no painel de anexos. Inclui gestor, membros de edição/leitura e Master. Não exibe usuários sem acesso ao município. O banco valida novamente a permissão ao salvar; uma conta desativada ou que perdeu o acesso não pode receber nova atribuição.

Na **homologação da migração**, **Validado por** é a única seleção de responsável. A escolha é salva junto da conferência e usada ao registrar o OK. O banco confirma nome e vínculo da conta; se não houver uma escolha, utiliza o usuário autenticado e o define como responsável. O operador que fez a gravação fica registrado separadamente em `recordedActorId`, `recordedBy` e no histórico do banco. A escolha, sozinha, não registra um OK nem reatribui OKs passados. Aceites técnicos/clientes e liberações mantêm suas regras de autoria. OKs antigos não são reatribuídos pela migração SQL. Na conferência da migração, o campo inicia com o usuário logado quando ainda não há responsável salvo; nos aceites da implantação, a seleção inicial continua como **Não definido**.

A edição usa uma revisão própria. Se outra pessoa alterar o responsável, a gravação conflitante é recusada e sua seleção é mantida. Use **Atualizar anexos e responsável** para rever o valor atual antes de escolher e salvar novamente. Na migração, um conflito mantém o formulário aberto para revisão. A atribuição anterior permanece no histórico, inclusive se a pessoa perder o acesso.

## Arquivos

Selecione um arquivo não vazio de até **15 MB**. O envio começa imediatamente e é salvo separadamente do formulário de conferência. Não é necessário registrar um novo OK para guardar o anexo. O nome, tamanho, autor autenticado e data/hora do servidor ficam associados ao arquivo.

- **Baixar** faz uma requisição autenticada ao Storage e baixa o arquivo, sem link público permanente.
- **Excluir anexo** pede confirmação. A exclusão é iniciada no banco antes de remover o arquivo do Storage, evitando que uma confirmação de upload concorrente reative o registro. Se a rede interromper, a exclusão fica pendente e pode ser concluída pelo mesmo botão.
- Se o upload falhar, o registro fica como **Envio pendente de confirmação** para os editores. **Confirmar envio** verifica se o arquivo chegou com o tamanho correto; se os bytes não chegaram, exclua o envio pendente e selecione o arquivo novamente. O sistema não apaga automaticamente arquivos em caso de resposta perdida, pois o banco pode já ter confirmado o recebimento.
- Leitores do projeto podem baixar arquivos concluídos. Inclusão, atribuição e exclusão exigem permissão de edição e projeto aberto. Projeto encerrado mantém leitura/download, com alterações bloqueadas.

Os anexos não são embutidos na impressão do termo/relatório nem compartilhados com o portal público do cliente. Eles ficam como evidências privadas da equipe. Não substituem a evidência textual nem alteram critérios de liberação existentes.

## Histórico, backup e manutenção

O painel registra as últimas 20 alterações de responsável e inclusões/exclusões confirmadas de arquivos, com autor e data do servidor. O banco mantém o restante do histórico enquanto o projeto existir. Metadados e auditoria ficam em `implanta_private.homologation_resources`, `homologation_files` e `homologation_resource_audit`.

O backup JSON de projetos não inclui estes registros nem os binários. Para cópia completa, inclua o esquema `implanta_private` no backup do banco e faça uma cópia do bucket privado do Storage. Um backup SQL, sozinho, não copia o conteúdo dos arquivos.

Excluir um projeto remove seus metadados pelo vínculo do banco e bloqueia o acesso aos arquivos. O Storage é um serviço separado: os binários remanescentes não são removidos por uma exclusão SQL. O administrador deve limpar os objetos sem referência no bucket, ou remover os anexos pelo painel antes de excluir o projeto. Nunca exclua diretamente linhas de `storage.objects` para tentar liberar espaço; use o painel/API do Storage. Mudanças de escopo não transportam arquivos para outra entidade ou módulo.

## Conferência

- Em duas homologações diferentes, escolha responsáveis distintos e confira que um não altera o outro. Na migração, registre um novo OK e confira que **Validado por** corresponde ao responsável escolhido, enquanto o histórico identifica o operador logado.
- Envie um arquivo pequeno; baixe após atualizar a página. Confira nome/autor e que o conteúdo foi preservado.
- Teste arquivo vazio e maior que 15 MB: o aplicativo deve recusar antes de enviar. O bucket também impõe o limite em chamadas diretas.
- Com leitor, confira que só o download está disponível. Com outra conta sem acesso ao projeto, o banco e o Storage devem negar consulta e gravação.
- Teste exclusão confirmada e recuperação de falha de rede, sem refazer as respostas do relatório.

Os testes automatizados usam PostgreSQL descartável e um contrato mínimo de Storage para exercitar as políticas SQL, além de respostas HTTP simuladas no navegador. A aplicação da migração e o envio de um arquivo de conferência no Supabase real precisam ser realizados após a ativação pelo administrador.
