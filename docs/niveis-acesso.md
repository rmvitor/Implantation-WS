# Master e gestão por projeto — 1.13.0

## Comportamento

| Nível | Alcance | Operações |
| --- | --- | --- |
| Master | Toda a plataforma | Aprovar/desativar contas, consultar todos os projetos e auditorias, transferir gestão e administrar acessos. |
| Gestor do projeto | Projetos sob sua gestão | Editar, encerrar/reabrir, excluir e conceder/remover Leitura ou Edição para colegas aprovados. |
| Editor | Projetos compartilhados com Edição | Trabalhar nos dados, atividades e homologação; consultar o CPF quando necessário. |
| Visualizador | Projetos compartilhados com Leitura | Consultar o conteúdo disponível; sem editar, liberar acessos, encerrar ou excluir. |

Novas contas continuam aguardando **aprovação inicial pelo Master**. Depois de aprovada, cada conta pode criar municípios e se torna gestora dos projetos que criar, sem outra intervenção do Master. O mesmo colega pode ser gestor em um projeto e editor/visualizador em outros. Não há acesso automático aos projetos alheios.

O nível Master fica reservado à conta dona da plataforma. A tela de gestão não oferece promoção de colegas para Master. Gestores não aprovam contas, não administram senhas de outros usuários e não transferem a gestão. Transferências ficam com o Master. A troca da própria senha permanece no Perfil e em Equipe e acessos.

O gestor busca um colega **pelo e-mail exato**, após o cadastro/liberação inicial, e define seu acesso ao projeto. Essa busca não expõe o cadastro completo da plataforma. A lista mostra os participantes atuais, o gestor e o Master, que mantém acesso global.

Backup completo com CPF/anexos e restauração pela interface continuam restritos ao responsável global. A exportação comum continua sem CPF/anexos. Esta versão não amplia a exportação de dados pessoais para gestores; a consulta do CPF respeita o acesso de edição ao município.

## Diagnóstico do código anterior

- A migração 001 concentrava criar/excluir/encerrar projetos e conceder acessos em `implanta_private.admin()`. A 002 repetia essas verificações no protocolo de registros separados.
- `created_by` já registrava a autoria no servidor, mas não concedia gestão ao autor.
- A interface usava um único `canManage` para criação, importação e ações em qualquer município, o que não representava permissões por projeto.
- A verificação visual de Edição não filtrava o usuário da concessão. Agora ela confere projeto e usuário, inclusive quando a consulta de registros separados retorna vários participantes; o banco continua sendo a barreira de autorização.
- `implanta_members` só tinha Editor/Visualizador, e a gestão de contas expunha o diretório global apenas aos administradores. Essas permissões anteriores são mantidas até a ativação da nova migração.

## Ativação pelo navegador

É uma **migração SQL**, sem Edge Functions, terminal ou senha administrativa no site. Publicar o frontend não altera o banco. O ambiente de desenvolvimento não dispõe de acesso administrativo ao Supabase de produção; a aplicação mantém o comportamento anterior enquanto o novo contrato não estiver ativo.

1. Faça um backup administrado do banco no Supabase, incluindo schema, usuários/perfis, membros, administradores e projetos. O JSON exportado pelo app não inclui todas as permissões e não substitui esse backup.
2. Confira os usuários e a autoria dos municípios usando as consultas abaixo. Na primeira ativação, antigos administradores globais passam a colaboradores: preservam os projetos que criaram e as concessões explícitas que já possuíam, mas deixam de acessar automaticamente todos os projetos. Essa mudança é necessária para limitar o alcance por projeto.
3. Abra [o arquivo da migração](https://github.com/rmvitor/Implantation-WS/blob/main/supabase/migrations/202610150001_project_ownership.sql), copie o conteúdo completo para **SQL Editor → New query** no [projeto Supabase](https://supabase.com/dashboard/project/hlwtswrgepsmyoghsghv/sql/new).
4. Na linha `select set_config('implanta.master_email','SEU_EMAIL_MASTER',true);`, substitua **SEU_EMAIL_MASTER** pelo e-mail da conta dona da plataforma, já cadastrada. Não use nome digitado, CPF ou senha. Execute a consulta inteira de uma vez.
5. Atualize o Implanta. O Perfil deve mostrar **Master** para a conta escolhida. Aprove um colega e faça os testes abaixo.

A migração suporta o banco com apenas a 001 e também o banco com a 002 já ativa. Não execute novamente a 001 em um banco existente. Se ativar a 002 depois desta migração, **reaplique a migração de gestão ao final**, para que o escritor de registros separados receba as verificações novas. A reexecução mantém transferências já feitas e não reinicializa o Master.

### Conferência antes da ativação

Execute no SQL Editor, como administrador do banco (não pela chave pública do site):

```sql
select p.id, p.email, p.display_name, p.active,
  exists(select 1 from implanta_private.admins a where a.user_id=p.id) as administrador_atual
from public.implanta_profiles p order by p.display_name;

select j.id, j.data->>'name' as municipio, j.created_by,
  p.display_name as autor, p.email as email_autor
from public.implanta_projects j
left join public.implanta_profiles p on p.id=j.created_by
order by j.data->>'name';
```

O Master configurado precisa corresponder a uma única conta cadastrada, tanto no Auth quanto no perfil. Caso contrário, a transação falha integralmente. Cadastro e confirmação de e-mail continuam seguindo a configuração existente de Authentication.

### Projetos existentes

A coluna protegida `owner_id` recebe o `created_by` já registrado pelo servidor. O conteúdo dos municípios, tarefas, chamados, homologação, histórico e versões não é reescrito. Concessões explícitas de Leitura/Edição continuam iguais. Projetos sem autor identificado ficam sob controle do Master até ele selecionar um gestor em **Equipe e acessos → Acessos por projeto → Gestor do projeto**.

O Master também pode transferir projetos criados por ele para os colegas responsáveis. A transferência conserva `created_by`, os registros e as permissões explícitas. O antigo gestor perde o acesso implícito; se precisar continuar trabalhando, receba uma concessão de Leitura/Edição. Encerrar e excluir continuam usando as confirmações já existentes.

## Proteções e rastreabilidade

- A propriedade fica em uma coluna do banco, fora do JSON importável dos projetos. Ao criar, o servidor registra `auth.uid()` como autor/gestor. Dados enviados pelo navegador não podem atribuir outro dono.
- RLS e RPCs verificam usuário ativo, propriedade e permissões em cada operação. A interface não é a barreira de autorização. Cadastro pendente e conta desativada não ganham acesso, mesmo se constarem como autores ou membros.
- Gestores só concedem Leitura/Edição em seus projetos. Não podem rebaixar Master/gestor por concessão de membro, atribuir a si a gestão de outro projeto ou alterar níveis globais.
- Concessões e transferências bloqueiam a linha do município durante a verificação, para não disputar uma mudança de proprietário. Salvamentos conservam o controle de versões anterior.
- `implanta_access_audit` registra autor, alvo, data/hora do servidor e antes/depois das alterações de conta, acesso e gestão feitas após a ativação. Clientes não inserem nesse histórico. O Master consulta tudo em Equipe e acessos; o gestor consulta apenas a auditoria de seus projetos. Auditorias de tarefas e homologação existentes continuam disponíveis.
- A consulta automática mantém as regras atuais: alterações de permissão chegam por notificação e conferência periódica. Mesmo antes da atualização visual, uma operação sem permissão é recusada pelo banco.

## Como testar

1. Como Master, confira todos os municípios, aprove um colega e consulte o histórico de acessos.
2. Como colega aprovado, crie um município. Deve receber gestão imediatamente após a confirmação do banco.
3. Nesse projeto, busque outro colega aprovado e conceda Leitura, depois Edição. Verifique as duas contas em aparelhos distintos.
4. Confirme que o gestor não consulta o diretório global, não aprova usuários e não altera/exclui/encerra projetos alheios compartilhados só para leitura.
5. Como Master, transfira um projeto antigo. Confira o novo gestor e que autoria, tarefas e dados continuam iguais.
6. Revogue um acesso e desative uma conta. Confirme que as próximas operações são bloqueadas e os dados saem da sessão na próxima conferência.

Os testes automatizados cobrem isolamento real em PostgreSQL nos dois protocolos, inclusive chamadas diretas que tentam contornar a interface. Os testes do navegador usam respostas HTTP controladas. A ativação e a homologação com contas reais de produção ainda precisam ser executadas pelo responsável do banco.

Se precisar reverter, restaure as permissões/funções a partir do backup administrado e publique uma versão compatível; não apague tabelas de projetos ou registros para desfazer níveis de acesso. Atualizações feitas pelos colegas depois do backup precisam ser consideradas antes de qualquer restauração completa.
