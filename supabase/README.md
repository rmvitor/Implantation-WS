# Ativar a equipe no Supabase

Para um banco já em uso, a versão 1.11.0 prepara uma migração aditiva de registros separados. Leia o [guia de migração revisada](../docs/migracao-registros.md) antes de alterar a estrutura. O site continua compatível com o formato anterior até a ativação.

A publicação já tem a conexão pública da equipe configurada em `src/team-config.json` e abre a tela de login. O desenvolvimento sem variáveis continua no modo local. Este repositório entrega o login, os controles de acesso e a estrutura do banco; a publicação no GitHub Pages não cria um projeto Supabase. Use **um mesmo projeto Supabase para toda a equipe**. A estrutura começa sem municípios ou atividades de exemplo.

## 1. Criar o projeto e aplicar a estrutura

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard) e crie um projeto. Guarde a senha do banco no seu gerenciador de senhas.
2. Abra **SQL Editor → New query**. Copie o conteúdo de [202610090001_implanta.sql](migrations/202610090001_implanta.sql) e execute uma vez. A migração cria tabelas, políticas, operações de gravação e notificações, dentro de uma transação. Não execute os dados dos testes nesse projeto.
3. Em **Authentication → URL Configuration**, configure:
   - Site URL: `https://rmvitor.github.io/Implantation-WS/`
   - Redirect URLs: `https://rmvitor.github.io/Implantation-WS/` e `https://rmvitor.github.io/Implantation-WS/**`
   - Para desenvolvimento, acrescente `http://localhost:5173/**` somente se for usar esse endereço.
4. Mantenha o provedor **Email** habilitado. Se a confirmação de e-mail estiver habilitada, confirme as contas antes de entrar. Para vários colegas, configure SMTP em Authentication para os e-mails de confirmação e recuperação, respeitando os limites do seu plano.

## 2. Conectar o site e cadastrar o primeiro administrador

1. Em **Project Settings → API / API Keys**, copie a **Project URL** e a **Publishable key** (ou a chave legada `anon`).
2. A publicação deste projeto já usa a conexão pública informada pelo responsável. Abra [Implanta](https://rmvitor.github.io/Implantation-WS/) para entrar ou criar sua conta. Para escolher outro Supabase neste aparelho, use **Configurar conexão** na tela de login e informe esses dois valores. A conexão usa somente uma chave pública; **não use `secret`, `service_role`, senha ou token administrativo no navegador**.
3. Na tela de login, clique em **Criar conta**, cadastre seu próprio e-mail e confirme-o, se solicitado. Inicialmente aparecerá “aguarda liberação”. Nenhuma conta vira administrador automaticamente.
4. No **SQL Editor** do seu projeto, execute o bloco abaixo substituindo `SEU_EMAIL` pelo e-mail da sua conta já cadastrada. É necessário acesso administrativo ao painel Supabase. O bloco falha se a conta não existir.

```sql
begin;
do $$
declare first_user uuid;
begin
  select id into first_user from public.implanta_profiles
    where lower(email) = lower('SEU_EMAIL');
  if first_user is null then
    raise exception 'Cadastre e confirme esta conta no site antes de liberar.';
  end if;
  update public.implanta_profiles set active = true where id = first_user;
  insert into implanta_private.admins(user_id) values(first_user)
    on conflict do nothing;
  perform implanta_private.notify(first_user);
end $$;
commit;
```

5. No site, clique em **Verificar acesso**. Você poderá cadastrar municípios e abrir **Equipe e acessos**.

## 3. Liberar os colegas e os projetos

Cada colega abre o site, que já usa a conexão da equipe, cria uma conta e confirma o e-mail. Em **Equipe e acessos**, o administrador:

- Aprova ou desativa contas e pode nomear outros administradores.
- Define **Sem acesso**, **Leitura** ou **Edição** por usuário e projeto.
- Cria, encerra, reabre, importa e exclui projetos. Administradores acessam todos os projetos; um editor pode alterar os dados e as atividades dos projetos liberados, mas não encerrar/excluir projetos nem gerenciar usuários. Um visualizador consulta os dados.

As restrições são verificadas no banco. Esconder ou desabilitar um botão não é a proteção principal. Cadastro de usuário não concede acesso a projetos. O administrador não pode remover seu próprio acesso administrativo pela aplicação.

## Dados locais, importação e colaboração

Conectar não envia seus projetos locais automaticamente. Antes da conexão, use **Dados e backup → Exportar backup**. Se a tela de login já estiver aberta, use **Exportar dados deste aparelho**, disponível quando houver projetos locais anteriores. Depois de entrar como administrador, use **Importar dados** para enviar esse arquivo ao banco. No modo online a importação acrescenta os novos projetos e atualiza projetos com a mesma identificação; preserva outros projetos existentes. A transação inteira falha se qualquer alteração não puder ser salva.

Cada salvamento confirma a gravação no banco antes de fechar o formulário. Alterações simultâneas em campos diferentes são combinadas. Se dois colegas alterarem o mesmo campo ou um excluir uma atividade que o outro estiver editando, a aplicação mantém o formulário e mostra o conflito para resolver sem sobrescrever silenciosamente. O banco exige a versão atual em cada gravação. Exclusão também confere a versão.

Atualizações chegam por notificações Realtime e por conferência a cada 15 segundos com a aba visível, além de ao retomar a janela ou conexão. Durante uma edição, a aplicação conserva o rascunho; revogar o acesso a um projeto retira seus dados da tela na próxima conferência. As notificações levam somente uma revisão, sem dados do projeto.

O PWA continua instalável. **O modo online exige internet para entrar, carregar e salvar; não há fila offline de gravações.** Os projetos online não são salvos no `localStorage` nem no cache do service worker. A sessão e a conexão pública ficam no navegador. Prefira **Sair** ao terminar num aparelho compartilhado. O modo local continua permitindo trabalho offline no aparelho e mantém seus backups anteriores.

O histórico funcional fica no projeto. A tabela `implanta_audit` registra também o usuário autenticado, operação, versão e horário no servidor; os clientes não escrevem diretamente nessa tabela. Anexos permanecem no JSON do projeto, com limite de 4 MB por projeto; não foi criado um armazenamento separado de arquivos.

## Configuração automática opcional do site

Para oferecer a conexão já preenchida a todos os colegas, configure as variáveis de build `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (esta última aceita a publishable key). O workflow lê as variáveis do repositório com esses nomes. Republique depois de configurá-las. São valores públicos incluídos no JavaScript; nunca coloque uma chave administrativa nessas variáveis.

No desenvolvimento, copie `.env.example` para `.env.local` e preencha os valores públicos. Sem as duas variáveis, a publicação usa `src/team-config.json`. Uma conexão escolhida explicitamente na tela de login tem prioridade neste aparelho. O build com `VITE_TEAM_MODE=local` desativa o padrão online e é usado nos testes do PWA local. Escolher outro Supabase requer informar novamente a conexão na tela de login.

## Verificar a estrutura em desenvolvimento

```sh
docker run --name implanta-postgres-test --rm -d \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 postgres:16
npm run test:db
docker stop implanta-postgres-test
```

Esse PostgreSQL contém somente dados artificiais. O script cria e remove uma base temporária própria, simula `auth.uid()` e executa a migração real. Ele verifica isolamento, acesso pendente, leitura/edição/administração, revogação, gravações concorrentes, auditoria e rollback da importação. A autenticação HTTP é simulada nos testes de navegador; a confirmação/recuperação de e-mail deve ser verificada no projeto Supabase real após ativá-lo.
