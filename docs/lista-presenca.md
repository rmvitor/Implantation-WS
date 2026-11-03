# Lista de presença dos treinamentos — v1.19.1

Acesse um município e abra **Listas de presença** na navegação lateral ou **Presença** na barra do projeto. Esta rotina usa o banco online, separada das atividades, aceites e agendas existentes. Não cria projetos de exemplo.

## Ativar no Supabase

1. Entre no projeto Supabase já usado pelo Implanta.
2. Abra **SQL Editor → New query**.
3. Se ainda não ativou as listas, execute primeiro [`202611030001_training_attendance.sql`](../supabase/migrations/202611030001_training_attendance.sql).
4. Execute todo o conteúdo de [`202611030002_attendance_required_fields.sql`](../supabase/migrations/202611030002_attendance_required_fields.sql) e clique em **Run**. Quem já usa as listas precisa executar somente este novo SQL.
5. Atualize o Implanta e abra **Listas de presença**.

Pré-requisitos: registros separados (`202610090002_records.sql` ou ativação posterior) e níveis Master/gestor (`202610150001_project_ownership.sql`). Quem já usa as versões recentes possui essa estrutura. O SQL desta rotina não exige substituir e-mails ou chaves, não muda usuários, projetos ou treinamentos existentes e pode ser reaplicado. Ele cria tabelas e funções novas em uma transação; faça o backup habitual do banco antes de alterações de estrutura.

A v1.19.1 substitui o padrão inicial de CPF opcional pelo padrão de todos os campos obrigatórios, conforme a nova escolha do usuário. Antes de aplicar o novo SQL, a configuração fica indisponível com um guia na tela; as listas existentes continuam acessíveis. A validação no banco por município passa a valer depois de executar esse SQL.

Não há SMTP, Edge Function, chave privada ou configuração de redirecionamento de autenticação nesta rotina. O link de presença é independente do portal de aceites e do login dos colegas.

## Criar e preencher

- **Nova lista**: título, entidade, cidade/UF, sistema, módulo, submódulos, instrutor, carga horária e data. O modelo enviado é a referência dos campos; o layout foi adaptado para impressão A4 paisagem.
- **Vincular a um treinamento** é opcional. Ao escolher um encontro já cadastrado, seus dados preenchem a lista. Ela guarda uma cópia desses dados: editar/excluir o encontro depois não apaga participantes nem altera silenciosamente a lista. Para mais de uma turma ou dia, crie listas distintas.
- **Campos obrigatórios**, no topo da área, configura nome completo, CPF, setor e e-mail para o município. **Todos são obrigatórios por padrão**, inclusive CPF. Master, gestor e editores com acesso ao projeto podem marcar/desmarcar cada campo. A escolha é salva no banco e vale para todas as listas desse município, existentes e novas, no cadastro manual e no formulário público. Os demais municípios mantêm sua própria configuração.
- A alteração não apaga nem preenche retroativamente dados antigos; as exigências valem para os próximos envios e edições. A configuração tem histórico com usuário/data e controle de versão para não sobrescrever a alteração de outro editor. A confirmação de participação no formulário externo permanece obrigatória.
- **Participante** permite inclusão manual. A obrigatoriedade segue a configuração do município; CPF e e-mail, quando informados, devem ser válidos mesmo se opcionais.
- **Editar** corrige os dados de um participante. CPF vazio na edição mantém o atual. Há uma opção expressa para removê-lo quando o campo é opcional. Se for obrigatório e já estiver registrado, não é preciso redigitá-lo; se ainda estiver vazio, será solicitado. A origem do registro e a data de inclusão são preservadas; as alterações ficam no histórico.
- Há busca por nome, setor ou e-mail. Enquanto a área está aberta e visível, ela consulta atualizações a cada 5 segundos e ao voltar para a janela. Depois de salvar, recarrega imediatamente. Não depende de atualizar o app.
- Edições conflitantes são recusadas pelo banco, mantendo o rascunho. Em **Recarregar a edição**, confira o aviso antes de descartar o rascunho e carregar a versão atual.

## Link e QR code

Em **Link e QR code**, escolha uma validade futura e gere o acesso. A tela começa com 7 dias, mas o técnico pode mudar a data/hora antes de gerar. Limite técnico de validade: 90 dias. Copie o link, baixe o QR code ou abra o formulário para conferir. O QR é calculado localmente no aplicativo, sem enviar dados para serviço externo.

O link tem um segredo aleatório de 64 caracteres. No banco fica somente seu hash. A equipe só vê o segredo no momento da geração; ele não é salvo nas preferências nem no armazenamento do navegador. Ao sair desta área/recarregar, renove se precisar compartilhar novamente. **Renovar** invalida o link/QR anterior, preservando a lista e os participantes. **Encerrar recebimento** invalida o acesso público imediatamente. Fechar o projeto também bloqueia novos envios; a lista continua disponível para leitura/impressão.

O cliente não precisa de conta. Ele vê os dados do treinamento e preenche somente seu próprio formulário. Não há consulta de participantes, CPFs, e-mails ou histórico por esse link. A equipe recebe os envios na mesma lista.

O envio registra data e hora do servidor e a origem **autodeclaração por formulário**. Não verifica identidade, não comprova que a pessoa ficou conectada em uma sala e não equivale a assinatura digital. Quem possui o link pode enviar dados; compartilhe apenas com a turma e encerre após o treinamento. A assinatura ocorre no relatório impresso, conforme escolha confirmada pelo usuário.

Repetir um envio após falha de rede não duplica o registro. Um mesmo e-mail não vazio aparece uma vez em cada lista; novo envio desse e-mail mantém o primeiro cadastro, e correções devem ser feitas pela equipe. Sem e-mail, homônimos não são bloqueados. Há limite técnico de 1.000 participantes por lista para conter consumo acidental/abusivo; não há captcha ou autenticação dos participantes. Não há prazo automático de retenção: a equipe pode corrigir/excluir os registros e definir sua política de guarda.

## Relatório e dados pessoais

**Imprimir lista** gera o documento com os campos do modelo, participantes, espaço para assinatura de cada pessoa e do instrutor. No diálogo do navegador, escolha **Salvar como PDF** para guardar uma cópia. **Folha em branco** imprime 14 linhas para preencher presencialmente. As listas maiores são paginadas; nomes/setores/e-mails quebram linha sem truncar o texto. Desative cabeçalhos/rodapés do navegador se não quiser a URL e a data acrescentadas por ele.

CPF segue a obrigatoriedade configurada pelo município e é mascarado nas consultas/impressões comuns. **Impressão restrita → Imprimir com CPF completo** é exclusiva do Master, validada no banco e registrada no histórico. As outras colunas também contêm dados pessoais: guarde o relatório em local protegido e compartilhe só com quem precisa dele. O formulário público informa o uso dos dados, se o CPF é obrigatório ou opcional e orienta procurar o instrutor para correção/remoção.

Os registros ficam em `implanta_private.attendance_lists`, `attendance_people`, `attendance_audit`, `attendance_settings` e `attendance_settings_audit`, com RLS habilitado e sem acesso direto de contas comuns ou anônimas. Funções conferem a permissão no projeto antes de ler/editar. Leitores do projeto podem consultar e imprimir com CPF mascarado; gestores, Master e editores podem preencher/gerenciar, com o projeto aberto. Revogar o acesso ao projeto impede consultas e alterações. O histórico registra autor autenticado nas ações da equipe; o participante externo não é apresentado como usuário autenticado.

**Backup:** o JSON legado de Dados e backup não inclui essas tabelas novas, nem as restaura. Isso é informado na tela. A cópia por lista é o relatório/PDF; para recuperação completa, inclua o esquema `implanta_private` no backup administrado do banco Supabase. Não confunda uma cópia para impressão com backup restaurável. Excluir uma lista apaga seus participantes/histórico e invalida o link, após confirmação. Excluir o município também exclui suas listas por vínculo de banco; os demais municípios ficam intactos.

## Conferência após ativação

1. Confira **Campos obrigatórios**: os quatro campos começam marcados. Se quiser testar sem CPF, desmarque CPF e salve. Crie uma lista sem vínculo a treinamento e inclua uma pessoa manualmente conforme os campos exigidos.
2. Gere um QR/link e abra em aba anônima ou no celular do cliente. Registre outra participação e confira sua chegada à tela da equipe em até 5 segundos.
3. Renove/encerre o link e confira que o anterior não aceita novos envios.
4. Edite um participante, imprima com CPF mascarado e confira a folha em branco.
5. Crie outra lista vinculada a um treinamento e confira os campos preenchidos.
6. Com leitor de projeto, confira que os cadastros/links estão desabilitados; com outro colega sem acesso ao município, confira que a lista não pode ser consultada.

Testes automatizados usam dados fictícios, HTTP simulado na interface e bancos PostgreSQL descartáveis. Não enviam mensagens, não cadastram presenças reais e não aplicam o SQL no banco de produção.
