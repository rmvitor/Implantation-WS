-- Additive ACL upgrade. Apply after 001; also supports 002 when already active.
-- Existing project data, history, revisions and explicit grants are preserved.
begin;

-- First activation: replace SEU_EMAIL_MASTER with the platform owner's
-- registered account. Only an administrator of the Supabase SQL Editor can
-- apply this migration; this is not a browser API or a signup privilege.
select set_config('implanta.master_email','SEU_EMAIL_MASTER',true);

create table if not exists implanta_private.role_settings(id integer primary key check(id=1),activated_at timestamptz not null default now());
revoke all on implanta_private.role_settings from public,anon,authenticated;

alter table public.implanta_projects add column if not exists owner_id uuid
  references public.implanta_profiles(id) on delete set null;
update public.implanta_projects set owner_id=created_by where owner_id is null and created_by is not null;
create index if not exists implanta_projects_by_owner on public.implanta_projects(owner_id);

-- Explicit platform-owner identity, supplied by the platform owner. No user
-- metadata or browser input can bootstrap this privilege. Missing/ambiguous
-- accounts abort the entire transaction, including any ownership backfill.
do $$
declare master_id uuid; matches integer; master_email text:=nullif(lower(current_setting('implanta.master_email',true)),'');
begin
  if exists(select 1 from implanta_private.role_settings where id=1) then return; end if;
  if master_email is null or master_email='seu_email_master' then raise exception 'Substitua SEU_EMAIL_MASTER pela conta dona da plataforma antes de ativar.'; end if;
  select count(*),min(p.id::text)::uuid into matches,master_id
    from public.implanta_profiles p join auth.users u on u.id=p.id
    where lower(p.email)=master_email and lower(u.email)=lower(p.email);
  if matches<>1 then raise exception 'Cadastre e confirme a conta dona da plataforma antes de ativar os níveis de acesso.'; end if;
  update public.implanta_profiles set active=true where id=master_id;
  -- Old global administrators become collaborators; their authored projects
  -- and all explicit editor/viewer grants remain available. Only the platform
  -- owner starts as Master. Platform ownership is not delegated by project grants.
  delete from implanta_private.admins where user_id<>master_id;
  insert into implanta_private.admins(user_id) values(master_id) on conflict do nothing;
  insert into implanta_private.role_settings(id) values(1);
end $$;

create table if not exists public.implanta_access_audit (
  id bigint generated always as identity primary key,
  project_id text,
  actor_id uuid references public.implanta_profiles(id) on delete set null,
  actor_name text not null,
  target_id uuid references public.implanta_profiles(id) on delete set null,
  target_name text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  at timestamptz not null default now()
);
alter table public.implanta_access_audit enable row level security;
revoke all on public.implanta_access_audit from public,anon,authenticated;
grant select on public.implanta_access_audit to authenticated;

create or replace function implanta_private.can_manage(p_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select implanta_private.enabled() and (implanta_private.admin() or exists(
    select 1 from public.implanta_projects where id=p_id and owner_id=auth.uid()))
$$;
create or replace function implanta_private.can_read(p_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select implanta_private.can_manage(p_id) or (implanta_private.enabled() and exists(
    select 1 from public.implanta_members where project_id=p_id and user_id=auth.uid()))
$$;
create or replace function implanta_private.can_edit(p_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select implanta_private.can_manage(p_id) or (implanta_private.enabled() and exists(
    select 1 from public.implanta_members where project_id=p_id and user_id=auth.uid() and role='editor'))
$$;
drop policy if exists implanta_access_audit_read on public.implanta_access_audit;
create policy implanta_access_audit_read on public.implanta_access_audit for select to authenticated
  using (implanta_private.admin() or (project_id is not null and implanta_private.can_manage(project_id)));
drop policy implanta_members_read on public.implanta_members;
create policy implanta_members_read on public.implanta_members for select to authenticated
  using (implanta_private.can_manage(project_id) or (user_id=auth.uid() and implanta_private.enabled()));

create or replace function implanta_private.audit_access(p_project text,p_target uuid,p_action text,p_before jsonb,p_after jsonb) returns void
language sql security definer set search_path='' as $$
  insert into public.implanta_access_audit(project_id,actor_id,actor_name,target_id,target_name,action,before_data,after_data)
    values(p_project,auth.uid(),coalesce((select display_name from public.implanta_profiles where id=auth.uid()),'Sistema'),p_target,coalesce((select display_name from public.implanta_profiles where id=p_target),'Conta'),p_action,p_before,p_after)
$$;

create or replace function implanta_private.protect_project_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then
    if tg_op='INSERT' then
      new.created_by:=auth.uid(); new.owner_id:=auth.uid(); new.updated_by:=auth.uid();
    elsif new.created_by is distinct from old.created_by then
      raise exception 'A autoria original do projeto não pode ser alterada.' using errcode='42501';
    elsif new.owner_id is distinct from old.owner_id and not implanta_private.admin() then
      raise exception 'Somente o Master pode transferir a gestão.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists implanta_owner_guard on public.implanta_projects;
create trigger implanta_owner_guard before insert or update on public.implanta_projects
  for each row execute function implanta_private.protect_project_owner();

create or replace function implanta_private.project_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare p_id text; p_data jsonb; p_version bigint; p_owner uuid; old_owner uuid; u uuid;
begin
  p_id:=case when tg_op='DELETE' then old.id else new.id end;
  p_data:=case when tg_op='DELETE' then old.data else new.data end;
  p_version:=case when tg_op='DELETE' then old.version else new.version end;
  p_owner:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
  old_owner:=case when tg_op='INSERT' then null else old.owner_id end;
  for u in select user_id from public.implanta_members where project_id=p_id
    union select user_id from implanta_private.admins union select p_owner union select old_owner
  loop if u is not null then perform implanta_private.notify(u); end if; end loop;
  insert into public.implanta_audit(project_id,project_name,actor_id,actor_name,action,version)
    values(p_id,p_data->>'name',auth.uid(),coalesce((select display_name from public.implanta_profiles where id=auth.uid()),'Sistema'),lower(tg_op),p_version);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.implanta_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'email',p.email,'name',p.display_name,'active',p.active,
    'admin',implanta_private.admin(),'master',implanta_private.admin(),'rolesVersion',1,
    'projectRoles',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'ownerId',j.owner_id,'ownerName',o.display_name))
      from public.implanta_projects j left join public.implanta_profiles o on o.id=j.owner_id
      where implanta_private.can_read(j.id)),'[]'))
  from public.implanta_profiles p where p.id=auth.uid()
$$;
create or replace function public.implanta_admin_users() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not implanta_private.admin() then raise exception 'Acesso Master necessário.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'name',p.display_name,'active',p.active,
    'admin',exists(select 1 from implanta_private.admins a where a.user_id=p.id),
    'master',exists(select 1 from implanta_private.admins a where a.user_id=p.id),
    'ownedProjects',coalesce((select jsonb_agg(j.id) from public.implanta_projects j where j.owner_id=p.id),'[]'))
    order by p.display_name),'[]') from public.implanta_profiles p);
end $$;
create or replace function public.implanta_set_user(p_user uuid,p_name text,p_active boolean,p_admin boolean) returns void
language plpgsql security definer set search_path='' as $$
declare before_user jsonb;
begin
  perform pg_advisory_xact_lock(2026100901);
  if not implanta_private.admin() then raise exception 'Somente o Master pode liberar contas e alterar níveis globais.' using errcode='42501'; end if;
  if p_admin and not exists(select 1 from implanta_private.admins where user_id=p_user) then
    raise exception 'O nível Master é reservado à conta dona da plataforma.' using errcode='42501'; end if;
  if p_user=auth.uid() and (not p_active or not p_admin) then raise exception 'Você não pode retirar seu próprio acesso Master.'; end if;
  if p_admin and not p_active then raise exception 'Master precisa de acesso ativo.'; end if;
  if p_active is null or p_admin is null or coalesce(trim(p_name),'')='' then raise exception 'Informe nome e situação do usuário.'; end if;
  select to_jsonb(p)||jsonb_build_object('master',exists(select 1 from implanta_private.admins where user_id=p_user)) into before_user
    from public.implanta_profiles p where id=p_user for update;
  if before_user is null then raise exception 'Usuário não encontrado.'; end if;
  update public.implanta_profiles set display_name=trim(p_name),active=p_active where id=p_user;
  if p_admin then insert into implanta_private.admins values(p_user) on conflict do nothing;
  else delete from implanta_private.admins where user_id=p_user; end if;
  perform implanta_private.audit_access(null,p_user,'conta atualizada',before_user,jsonb_build_object('name',trim(p_name),'active',p_active,'master',p_admin));
  -- Editors/managers may see a new global Master and need refreshed labels.
  perform implanta_private.notify(p_user);
end $$;

create or replace function public.implanta_grant_project(p_project text,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare project_owner uuid; before_role text;
begin
  -- Serialize permission checks with transfer/deletion of the same project.
  select owner_id into project_owner from public.implanta_projects where id=p_project for update;
  if not found or not implanta_private.can_manage(p_project) then raise exception 'Sem permissão para gerenciar este projeto.' using errcode='42501'; end if;
  if p_user=project_owner or exists(select 1 from implanta_private.admins where user_id=p_user) then
    raise exception 'Master e gestor têm acesso pelo seu nível; não podem ser rebaixados por uma permissão de projeto.' using errcode='42501'; end if;
  if p_role is not null and not exists(select 1 from public.implanta_profiles where id=p_user and active) then
    raise exception 'A conta precisa estar liberada pelo Master.' using errcode='42501'; end if;
  if p_role is not null and p_role not in ('editor','viewer') then raise exception 'Permissão inválida.' using errcode='42501'; end if;
  select role into before_role from public.implanta_members where project_id=p_project and user_id=p_user;
  if p_role is null then delete from public.implanta_members where project_id=p_project and user_id=p_user;
  else insert into public.implanta_members values(p_project,p_user,p_role)
    on conflict(project_id,user_id) do update set role=excluded.role; end if;
  perform implanta_private.audit_access(p_project,p_user,'acesso ao projeto',jsonb_build_object('role',before_role),jsonb_build_object('role',p_role));
end $$;

create or replace function public.implanta_project_people(p_project text,p_email text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not implanta_private.can_manage(p_project) then raise exception 'Sem permissão para consultar os acessos deste projeto.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'email',p.email,'active',p.active,
    'role',case when a.user_id is not null then 'master' when j.owner_id=p.id then 'owner' else m.role end)
    order by p.display_name),'[]')
    from public.implanta_profiles p cross join public.implanta_projects j
    left join implanta_private.admins a on a.user_id=p.id
    left join public.implanta_members m on m.user_id=p.id and m.project_id=j.id
    where j.id=p_project and (a.user_id is not null or j.owner_id=p.id or m.user_id is not null
      or (p.active and p_email is not null and lower(p.email)=lower(trim(p_email)))));
end $$;
create or replace function public.implanta_transfer_project(p_project text,p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare old_owner uuid;
begin
  if not implanta_private.admin() then raise exception 'Somente o Master pode transferir a gestão.' using errcode='42501'; end if;
  select owner_id into old_owner from public.implanta_projects where id=p_project for update;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if not exists(select 1 from public.implanta_profiles where id=p_owner and active) then raise exception 'Escolha uma conta ativa.'; end if;
  update public.implanta_projects set owner_id=p_owner where id=p_project;
  perform implanta_private.audit_access(p_project,p_owner,'gestão transferida',jsonb_build_object('ownerId',old_owner),jsonb_build_object('ownerId',p_owner));
end $$;

-- The legacy protocol retains CAS and transaction behavior.
create or replace function public.implanta_create_project(p_data jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso precisa ser liberado pelo Master.' using errcode='42501'; end if;
  perform implanta_private.check_project(p_data);
  insert into public.implanta_projects(id,data,created_by,updated_by,owner_id)
    values(p_data->>'id',p_data,auth.uid(),auth.uid(),auth.uid());
  return 1;
end $$;
create or replace function public.implanta_save_project(p_id text,p_data jsonb,p_version bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare current_row public.implanta_projects; next_version bigint;
begin
  perform implanta_private.check_project(p_data);
  if p_data->>'id' is distinct from p_id then raise exception 'Identificação do projeto inválida.'; end if;
  select * into current_row from public.implanta_projects where id=p_id for update;
  if not found or not implanta_private.can_edit(p_id) then raise exception 'Você não tem permissão para editar este projeto.' using errcode='42501'; end if;
  if current_row.version is distinct from p_version then raise exception 'O projeto foi atualizado por outro colega.' using errcode='40001'; end if;
  if not implanta_private.can_manage(p_id) and (coalesce(p_data->>'status','active') is distinct from coalesce(current_row.data->>'status','active')
    or p_data->'closedAt' is distinct from current_row.data->'closedAt') then raise exception 'Somente Master ou gestor podem encerrar ou reabrir projetos.' using errcode='42501'; end if;
  update public.implanta_projects set data=p_data,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning version into next_version;
  return next_version;
end $$;
create or replace function public.implanta_delete_project(p_id text,p_version bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.implanta_projects where id=p_id for update;
  if not implanta_private.can_manage(p_id) then raise exception 'Somente Master ou gestor podem excluir este projeto.' using errcode='42501'; end if;
  delete from public.implanta_projects where id=p_id and version=p_version;
  if not found then raise exception 'O projeto foi alterado ou removido por outro colega.' using errcode='40001'; end if;
end $$;

revoke all on function implanta_private.can_manage(text),implanta_private.audit_access(text,uuid,text,jsonb,jsonb),implanta_private.protect_project_owner() from public,anon,authenticated;
grant execute on function implanta_private.can_manage(text) to authenticated;
revoke all on function public.implanta_project_people(text,text),public.implanta_transfer_project(text,uuid) from public,anon;
grant execute on function public.implanta_project_people(text,text),public.implanta_transfer_project(text,uuid) to authenticated;

-- Normalized writer is replaced below only when migration 002 is active.

do $upgrade$ begin
  if to_regprocedure('public.implanta_commit_v2(jsonb,jsonb,jsonb,jsonb,jsonb,boolean)') is not null then
    execute $writer$
create or replace function public.implanta_commit_v2(p_changes jsonb,p_removed jsonb,p_created jsonb,p_deleted jsonb,p_preferences jsonb,p_import boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare item jsonb; old_data jsonb; payload jsonb; target regclass; current_revision bigint; author text;
  affected text[] := '{}'; project_id text; kind text; record_id text; stamp text := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); fields text[];
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
  if p_import and not implanta_private.admin() then raise exception 'Somente administradores podem importar.' using errcode='42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_typeof(p_removed) is distinct from 'array' or jsonb_typeof(p_created) is distinct from 'array' or jsonb_typeof(p_deleted) is distinct from 'array' then raise exception 'Alterações inválidas.'; end if;
  select display_name into author from public.implanta_profiles where id=auth.uid();
  -- Locks in deterministic order. A child deletion cannot race a context update.
  perform 1 from public.implanta_projects where id in (
    select value->>'project_id' from jsonb_array_elements(p_changes || p_removed)
    union select value->>'id' from jsonb_array_elements(p_deleted)) order by id for update;
  for item in select value from jsonb_array_elements(p_created) loop
    if not implanta_private.enabled() then raise exception 'Seu acesso precisa ser liberado pelo Master.' using errcode='42501'; end if;
    perform implanta_private.check_project(item->'data');
    if item->>'id' is distinct from item->'data'->>'id' then raise exception 'Identificação inválida.'; end if;
    insert into public.implanta_projects(id,data,created_by,updated_by) values(item->>'id',item->'data',auth.uid(),auth.uid());
    affected:=array_append(affected,item->>'id');
  end loop;
  for item in select value from jsonb_array_elements(p_deleted) loop
    if not implanta_private.can_manage(item->>'id') then raise exception 'Somente Master ou gestor podem excluir este projeto.' using errcode='42501'; end if;
    delete from public.implanta_projects where id=item->>'id' and version=(item->>'version')::bigint;
    if not found then raise exception 'O projeto foi alterado por outro colega.' using errcode='40001'; end if;
  end loop;
  -- Remove linked context/ticket before their parent activity. Every child revision
  -- must match; the transaction rolls back if any record received a newer edit.
  for item in select value from jsonb_array_elements(p_removed) where value->>'kind'='activity' loop
    if exists(select 1 from public.implanta_context_records c where c.project_id=item->>'project_id' and c.id=item->>'id' and not exists(select 1 from jsonb_array_elements(p_removed) removal where removal->>'kind'='context' and removal->>'project_id'=c.project_id and removal->>'id'=c.id and (removal->>'revision')::bigint=c.revision))
      or exists(select 1 from public.implanta_ticket_records c where c.project_id=item->>'project_id' and c.id=item->>'id' and not exists(select 1 from jsonb_array_elements(p_removed) removal where removal->>'kind'='ticket' and removal->>'project_id'=c.project_id and removal->>'id'=c.id and (removal->>'revision')::bigint=c.revision))
    then raise exception 'Confirme a versão dos registros vinculados antes de excluir a atividade.' using errcode='40001'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_removed) order by case when value->>'kind'='activity' then 1 else 0 end loop
    project_id:=item->>'project_id'; kind:=item->>'kind'; record_id:=item->>'id';
    if not implanta_private.can_edit(project_id) then raise exception 'Sem permissão para remover.' using errcode='42501'; end if;
    if kind in ('municipality','history') and not p_import then raise exception 'Registros cadastrais e históricos não podem ser apagados isoladamente.' using errcode='42501'; end if;
    select relation into target from implanta_private.record_tables where record_tables.kind=kind;
    if target is null then raise exception 'Tipo de registro inválido.'; end if;
    execute format('delete from %s where project_id=$1 and id=$2 and revision=$3 returning data',target) into old_data using project_id,record_id,(item->>'revision')::bigint;
    if old_data is null then raise exception 'O registro foi alterado por outro colega.' using errcode='40001'; end if;
    insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name) values(project_id,kind,record_id,'excluído',auth.uid(),author);
    affected:=array_append(affected,project_id);
  end loop;
  -- Parents first; context before validation so the conclusion criterion is checked.
  for item in select value from jsonb_array_elements(p_changes) order by case value->>'kind' when 'municipality' then 0 when 'activity' then 1 when 'context' then 2 else 3 end loop
    project_id:=item->>'project_id'; kind:=item->>'kind'; record_id:=item->>'id'; payload:=item->'data'; old_data:=null; current_revision:=0;
    if not implanta_private.can_edit(project_id) then raise exception 'Sem permissão para editar.' using errcode='42501'; end if;
    select relation into target from implanta_private.record_tables where record_tables.kind=kind;
    if target is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4194304 then raise exception 'Registro inválido.'; end if;
    execute format('select data,revision from %s where project_id=$1 and id=$2 for update',target) into old_data,current_revision using project_id,record_id;
    if coalesce(current_revision,0) is distinct from (item->>'revision')::bigint then raise exception 'O registro foi atualizado por outro colega.' using errcode='40001'; end if;
    if kind in ('activity','training','conference','history','handover','municipality') and payload->>'id' is distinct from record_id then raise exception 'Identificação do registro inválida.'; end if;
    if kind in ('personal','homologation') and record_id<>project_id then raise exception 'Vínculo do município inválido.'; end if;
    if kind='personal' and jsonb_typeof(payload->'cpf') is distinct from 'string' then raise exception 'CPF inválido.'; end if;
    if kind='municipality' then
      if record_id <> project_id or coalesce(trim(payload->>'name'),'')='' or coalesce(payload->>'status','active') not in ('active','closed') then raise exception 'Município inválido.'; end if;
      if payload ?| array['tasks','trainings','logs','handovers','homologation','cpf'] then raise exception 'Use registros separados para dados do município.'; end if;
      if old_data is not null and not implanta_private.can_manage(project_id) and (payload->'status' is distinct from old_data->'status' or payload->'closedAt' is distinct from old_data->'closedAt') then raise exception 'Somente administradores podem encerrar projetos.' using errcode='42501'; end if;
    end if;
    if kind='activity' and (coalesce(trim(payload->>'title'),'')='' or coalesce(payload->>'stage','') not in ('todo','progress','waiting','homologacao','concluido')) then raise exception 'Atividade inválida.'; end if;
    if kind='history' and old_data is not null and not p_import then raise exception 'Histórico é somente inclusão.' using errcode='42501'; end if;
    if kind in ('history','handover') then
      if p_import then payload:=payload || jsonb_build_object('source','imported-unverified');
      else payload:=payload || jsonb_build_object('actorId',auth.uid(),'actorName',author,'at',stamp,'source','server');
        if kind='history' and payload->'validation' is not null and payload->'validation'<>'null'::jsonb then payload:=jsonb_set(payload,'{validation}',payload->'validation' || jsonb_build_object('actorId',auth.uid(),'by',author,'at',stamp,'source','server')); end if;
      end if;
    end if;
    if kind='activity' and payload->>'stage'='concluido' and p_import then
      payload:=jsonb_set(payload,'{validation}',coalesce(payload->'validation','{}') || jsonb_build_object('source','imported-unverified'));
    elsif kind='activity' and payload->>'stage'='concluido' and (old_data is null or old_data->>'stage' is distinct from 'concluido' or payload->'validation' is distinct from old_data->'validation') then
      payload:=jsonb_set(payload,'{validation}',coalesce(payload->'validation','{}') || jsonb_build_object('actorId',auth.uid(),'by',author,'at',stamp,'source','server'));
      payload:=payload || jsonb_build_object('completedAt',coalesce(old_data->>'completedAt',stamp));
    elsif kind='activity' and payload->>'stage'<>'concluido' then payload:=payload || jsonb_build_object('validation',null,'completedAt',null);
    end if;
    if kind='conference' and payload->>'status'='ok' and (coalesce(trim(payload->>'evidence'),'')='' or jsonb_typeof(payload->'checks') is distinct from 'array' or jsonb_array_length(payload->'checks')=0 or exists(select 1 from jsonb_array_elements(payload->'checks') c where c->>'done' is distinct from 'true')) then raise exception 'OK exige conferências concluídas e evidência.'; end if;
    if kind='conference' and payload->>'status'='ok' and (old_data is null or payload is distinct from old_data) then
      if p_import then payload:=payload || jsonb_build_object('validationSource','imported-unverified');
      else payload:=payload || jsonb_build_object('validatedActorId',auth.uid(),'validatedBy',author,'validatedAt',stamp,'validationSource','server'); end if;
    end if;
    if kind='homologation' and payload->'release' is not null and payload->'release'<>'null'::jsonb and payload->'release' is distinct from old_data->'release' then
      if p_import then payload:=jsonb_set(payload,'{release}',payload->'release' || jsonb_build_object('source','imported-unverified'));
      else payload:=jsonb_set(payload,'{release}',payload->'release' || jsonb_build_object('actorId',auth.uid(),'by',author,'at',stamp,'source','server')); end if;
    end if;
    select array_agg(key) into fields from (select key from jsonb_each(payload) union select key from jsonb_each(coalesce(old_data,'{}'))) keys where payload->key is distinct from old_data->key;
    execute format('insert into %s(project_id,id,data,updated_at,updated_by) values($1,$2,$3,now(),auth.uid()) on conflict(project_id,id) do update set data=excluded.data,revision=%s.revision+1,updated_at=now(),updated_by=auth.uid()',target,target) using project_id,record_id,payload;
    insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name,changed_fields) values(project_id,kind,record_id,case when p_import then 'importado' when old_data is null then 'criado' else 'atualizado' end,auth.uid(),author,coalesce(fields,'{}'));
    if kind='context' and not p_import and payload->'criterion' is distinct from old_data->'criterion' then
      update public.implanta_activity_records a set data=jsonb_set(a.data,'{validation}',coalesce(a.data->'validation','{}') || jsonb_build_object('actorId',auth.uid(),'by',author,'at',stamp,'source','server')),revision=a.revision+1,updated_at=now(),updated_by=auth.uid()
        where a.project_id=project_id and a.id=record_id and a.data->>'stage'='concluido';
      if found then insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name,changed_fields) values(project_id,'activity',record_id,'validação atualizada',auth.uid(),author,array['validation']); end if;
    end if;
    affected:=array_append(affected,project_id);
  end loop;
  -- Validate the final linked state, including changes to conclusion context.
  for project_id in select distinct unnest(affected) loop
    if exists(select 1 from public.implanta_activity_records a left join public.implanta_context_records c using(project_id,id)
      where a.project_id=project_id and a.data->>'stage'='concluido' and a.id in (select value->>'id' from jsonb_array_elements(p_changes) where value->>'project_id'=project_id and value->>'kind' in ('activity','context')) and
      (coalesce(trim(c.data->>'criterion'),'')='' or coalesce(trim(a.data->'validation'->>'evidence'),'')='' or coalesce(trim(a.data->'validation'->>'by'),'')='')) then raise exception 'Conclusão exige critério e evidência de validação.'; end if;
    if exists(select 1 from public.implanta_homologation_records h where h.project_id=project_id and h.data->'release' is not null and h.data->'release'<>'null'::jsonb and h.id in (select value->>'id' from jsonb_array_elements(p_changes) where value->>'project_id'=project_id and value->>'kind'='homologation') and (
      not exists(select 1 from public.implanta_conference_records c where c.project_id=project_id and c.data->>'included'='true' and exists(select 1 from public.implanta_municipality_records m where m.project_id=project_id and m.data->'entities' ? (c.data->>'entity')) and c.data->>'module' in ('Compras e Contratos','Almoxarifado','Patrimônio','Frota','Fiscalização de contrato','Elicita'))
      or exists(select 1 from public.implanta_conference_records c where c.project_id=project_id and c.data->>'included'='true' and exists(select 1 from public.implanta_municipality_records m where m.project_id=project_id and m.data->'entities' ? (c.data->>'entity')) and c.data->>'module' in ('Compras e Contratos','Almoxarifado','Patrimônio','Frota','Fiscalização de contrato','Elicita') and c.data->>'status' is distinct from 'ok')
      or coalesce((select jsonb_agg(c.id order by c.id) from public.implanta_conference_records c where c.project_id=project_id and c.data->>'included'='true' and exists(select 1 from public.implanta_municipality_records m where m.project_id=project_id and m.data->'entities' ? (c.data->>'entity')) and c.data->>'module' in ('Compras e Contratos','Almoxarifado','Patrimônio','Frota','Fiscalização de contrato','Elicita')),'[]') is distinct from coalesce((select jsonb_agg(v.value order by v.value) from jsonb_array_elements(h.data->'release'->'scope') v),'[]')
    )) then raise exception 'Liberação exige OK em todo o escopo previsto.'; end if;
    if not exists(select 1 from public.implanta_municipality_records m where m.project_id=project_id) then raise exception 'Dados do município ausentes.'; end if;
    update public.implanta_projects p set version=p.version+1,updated_at=now(),updated_by=auth.uid() where p.id=project_id;
  end loop;
  if p_preferences is not null then perform public.implanta_save_preferences(p_preferences); end if;
  return public.implanta_read_v2();
end $$;
$writer$;
  end if;
end $upgrade$;

-- Wake all users to refresh global flags and scoped ownership metadata.
do $$ declare u uuid; begin
  for u in select id from public.implanta_profiles loop perform implanta_private.notify(u); end loop;
end $$;
notify pgrst,'reload schema';
commit;
