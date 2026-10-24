-- Ativação completa 1.15.0: registros separados + novas funções dos aceites.
-- Requer níveis Master/gestor e o primeiro SQL de homologação já aplicados.
-- Faça backup antes. Copie este arquivo inteiro no SQL Editor e execute uma vez.
-- Não há campos para substituir. Dados, Master, gestores e acessos são preservados.
-- Transação única: uma falha desfaz todas as etapas; reaplicação segura.
begin;
set local lock_timeout='15s';
-- Wait for in-flight project writes before copying; concurrent edits cannot be lost.
lock table public.implanta_projects in access exclusive mode;
do $acceptance_activation$
begin
 if to_regclass('implanta_private.role_settings') is null then raise exception 'Ative primeiro os níveis Master/gestor.'; end if;
 if not exists(select 1 from implanta_private.role_settings where id=1) then raise exception 'Os níveis de acesso ainda não foram ativados.'; end if;
 if to_regprocedure('public.implanta_implantation_capabilities()') is null then raise exception 'Execute primeiro 202610240001_implantation_acceptance.sql.'; end if;
 if to_regclass('implanta_private.record_tables') is null then
 execute $acceptance_records_migration$
-- REVIEW / STAGING FIRST. Additive cutover, no deletion of legacy project snapshots.
-- Requires 202610090001_implanta.sql. Publish the compatible client before applying.

create table implanta_private.record_tables(kind text primary key, relation regclass not null);
do $$
declare kind text; tbl text; schema_name text;
begin
  foreach kind in array array['municipality','activity','ticket','context','handover','training','history','homologation','conference','personal'] loop
    schema_name := case when kind='personal' then 'implanta_private' else 'public' end;
    tbl := 'implanta_' || kind || '_records';
    execute format('create table %I.%I (
      project_id text not null references public.implanta_projects(id) on delete cascade,
      id text not null, data jsonb not null check(jsonb_typeof(data)=''object''),
      revision bigint not null default 1, created_at timestamptz not null default now(),
      updated_at timestamptz, updated_by uuid references public.implanta_profiles(id) on delete set null,
      primary key(project_id,id))',schema_name,tbl);
    execute format('alter table %I.%I enable row level security',schema_name,tbl);
    if kind <> 'personal' then
      execute format('create policy record_read on %I.%I for select to authenticated using (implanta_private.can_read(project_id))',schema_name,tbl);
      execute format('grant select on %I.%I to authenticated',schema_name,tbl);
    end if;
    insert into implanta_private.record_tables values(kind,format('%I.%I',schema_name,tbl)::regclass);
  end loop;
end $$;
alter table public.implanta_context_records add foreign key(project_id,id) references public.implanta_activity_records(project_id,id) on delete cascade;
alter table public.implanta_ticket_records add foreign key(project_id,id) references public.implanta_activity_records(project_id,id) on delete cascade;
create index implanta_activity_stage on public.implanta_activity_records((data->>'stage'));
create index implanta_activity_due on public.implanta_activity_records((data->>'date'));
create index implanta_activity_updated on public.implanta_activity_records(updated_at);
create index implanta_ticket_number on public.implanta_ticket_records((data->>'ticket'));
create table public.implanta_record_audit(
  id bigint generated always as identity primary key,
  project_id text not null, kind text not null, record_id text not null,
  action text not null, actor_id uuid, actor_name text not null, at timestamptz not null default now(),
  changed_fields text[] not null default '{}'
);
alter table public.implanta_record_audit enable row level security;
create policy record_audit_read on public.implanta_record_audit for select to authenticated using(implanta_private.can_read(project_id));
grant select on public.implanta_record_audit to authenticated;
create index implanta_record_audit_project_time on public.implanta_record_audit(project_id,at desc);

-- Imported dates are retained. Unknown task update times remain unknown.
create function implanta_private.safe_timestamp(value text) returns timestamptz
language plpgsql immutable set search_path='' as $$
begin return value::timestamptz; exception when others then return null; end $$;

do $$
declare p record; t jsonb; x jsonb; last_update timestamptz; original_count bigint; copied_count bigint;
begin
  for p in select * from public.implanta_projects loop
    insert into public.implanta_municipality_records(project_id,id,data,updated_at)
      values(p.id,p.id,(p.data-array['tasks','trainings','logs','handovers','homologation','cpf']) || jsonb_build_object(
        'taskOrder',coalesce((select jsonb_agg(value->'id') from jsonb_array_elements(p.data->'tasks')),'[]'),
        'trainingOrder',coalesce((select jsonb_agg(value->'id') from jsonb_array_elements(p.data->'trainings')),'[]')),p.updated_at);
    insert into implanta_private.implanta_personal_records(project_id,id,data) values(p.id,p.id,jsonb_build_object('cpf',coalesce(p.data->>'cpf','')));
    for t in select value from jsonb_array_elements(p.data->'tasks') loop
      select max(implanta_private.safe_timestamp(value->>'at')) into last_update from jsonb_array_elements(p.data->'logs') where value->>'taskId'=t->>'id';
      last_update := greatest(last_update,implanta_private.safe_timestamp(t->>'updatedAt'));
      insert into public.implanta_activity_records(project_id,id,data,updated_at) values(p.id,t->>'id', t-array['problem','impact','nextAction','nextOwner','blockedBy','criterion','evidence','ticket','ticketUrl','ticketStatus','updatedAt','updatedBy'],last_update);
      insert into public.implanta_context_records(project_id,id,data) values(p.id,t->>'id',jsonb_strip_nulls(jsonb_build_object('problem',t->'problem','impact',t->'impact','nextAction',t->'nextAction','nextOwner',t->'nextOwner','blockedBy',t->'blockedBy','criterion',t->'criterion','evidence',t->'evidence')));
      if t->>'type'='chamado' or coalesce(t->>'ticket','')<>'' or coalesce(t->>'ticketUrl','')<>'' or coalesce(t->>'ticketStatus','Aguardando retorno')<>'Aguardando retorno' then
      insert into public.implanta_ticket_records(project_id,id,data) values(p.id,t->>'id',jsonb_strip_nulls(jsonb_build_object('ticket',t->'ticket','ticketUrl',t->'ticketUrl','ticketStatus',t->'ticketStatus')));
      end if;
    end loop;
    for x in select value from jsonb_array_elements(p.data->'trainings') loop
      insert into public.implanta_training_records(project_id,id,data) values(p.id,x->>'id',x);
    end loop;
    for x in select value from jsonb_array_elements(p.data->'logs') loop
      insert into public.implanta_history_records(project_id,id,data) values(p.id,x->>'id',x);
    end loop;
    for x in select value from jsonb_array_elements(coalesce(p.data->'handovers','[]')) loop
      insert into public.implanta_handover_records(project_id,id,data) values(p.id,x->>'id',x);
    end loop;
    if p.data ? 'homologation' then
      insert into public.implanta_homologation_records(project_id,id,data) values(p.id,p.id,((p.data->'homologation')-'entries') || jsonb_build_object('entryOrder',coalesce((select jsonb_agg(value->'id') from jsonb_array_elements(p.data->'homologation'->'entries')),'[]')));
      for x in select value from jsonb_array_elements(p.data->'homologation'->'entries') loop
        insert into public.implanta_conference_records(project_id,id,data) values(p.id,x->>'id',x);
      end loop;
    end if;
  end loop;
  select coalesce(sum(jsonb_array_length(data->'tasks')),0) into original_count from public.implanta_projects;
  select count(*) into copied_count from public.implanta_activity_records;
  if original_count <> copied_count then raise exception 'Contagem de atividades divergente: migração cancelada.'; end if;
  select coalesce(sum(jsonb_array_length(data->'logs')),0) into original_count from public.implanta_projects;
  select count(*) into copied_count from public.implanta_history_records;
  if original_count <> copied_count then raise exception 'Contagem de históricos divergente: migração cancelada.'; end if;
end $$;

create function public.implanta_read_v2() returns jsonb
language plpgsql security definer set search_path='' as $$
declare records jsonb := '[]'; part jsonb; table_row record;
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
  for table_row in select * from implanta_private.record_tables loop
    execute format('select coalesce(jsonb_agg(jsonb_build_object(''kind'',$1,''project_id'',project_id,''id'',id,''data'',data,''revision'',revision,''updated_at'',updated_at,''updated_by'',updated_by)),''[]'') from %s where implanta_private.can_read(project_id) and ($1<>''personal'' or implanta_private.can_edit(project_id))',table_row.relation)
      into part using table_row.kind;
    records := records || part;
  end loop;
  return jsonb_build_object('records',records,'admin',implanta_private.admin(),
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version)) from public.implanta_projects where implanta_private.can_read(id)),'[]'),
    'access',coalesce((select jsonb_agg(to_jsonb(m)) from public.implanta_members m where implanta_private.can_read(m.project_id)),'[]'),
    'preferences',coalesce((select data from public.implanta_preferences where user_id=auth.uid()),'{}'));
end $$;

create function public.implanta_commit_v2(p_changes jsonb,p_removed jsonb,p_created jsonb,p_deleted jsonb,p_preferences jsonb,p_import boolean default false) returns jsonb
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
    if not implanta_private.admin() then raise exception 'Somente administradores podem criar projetos.' using errcode='42501'; end if;
    perform implanta_private.check_project(item->'data');
    if item->>'id' is distinct from item->'data'->>'id' then raise exception 'Identificação inválida.'; end if;
    insert into public.implanta_projects(id,data,created_by,updated_by) values(item->>'id',item->'data',auth.uid(),auth.uid());
    affected:=array_append(affected,item->>'id');
  end loop;
  for item in select value from jsonb_array_elements(p_deleted) loop
    if not implanta_private.admin() then raise exception 'Somente administradores podem excluir projetos.' using errcode='42501'; end if;
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
      if old_data is not null and not implanta_private.admin() and (payload->'status' is distinct from old_data->'status' or payload->'closedAt' is distinct from old_data->'closedAt') then raise exception 'Somente administradores podem encerrar projetos.' using errcode='42501'; end if;
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

-- Snapshot contains the old CPF; remove API access. ACL helpers retain access as
-- security definers. Browser code reads the scoped v2 RPC after the cutover.
revoke select on public.implanta_projects from authenticated;
-- Block legacy writers explicitly, so an outdated client cannot change a second
-- source of truth or overwrite the preserved snapshot.
create or replace function public.implanta_commit(p_changes jsonb,p_removed jsonb,p_preferences jsonb) returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Atualize o aplicativo: o banco usa registros separados.' using errcode='55000'; end $$;
revoke execute on function public.implanta_create_project(jsonb),public.implanta_save_project(text,jsonb,bigint),public.implanta_delete_project(text,bigint) from authenticated;
revoke all on function public.implanta_read_v2(),public.implanta_commit_v2(jsonb,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.implanta_read_v2(),public.implanta_commit_v2(jsonb,jsonb,jsonb,jsonb,jsonb,boolean) to authenticated;
revoke all on all functions in schema implanta_private from public,anon;
revoke all on implanta_private.record_tables,implanta_private.implanta_personal_records from public,anon,authenticated;
notify pgrst,'reload schema';
$acceptance_records_migration$;
 end if;
 execute $acceptance_roles_migration$
-- Additive ACL upgrade. Apply after 001; also supports 002 when already active.
-- Existing project data, history, revisions and explicit grants are preserved.

-- Master already configured: the activated role_settings row prevents bootstrap changes.
select set_config('implanta.master_email','master-ja-configurado',true);

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
  if master_email is null or master_email='seu_email_master' then raise exception 'Substitua MASTER_JA_CONFIGURADO pela conta dona da plataforma antes de ativar.'; end if;
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
$acceptance_roles_migration$;
 execute $acceptance_base_migration$
-- Homologação da implantação. Adição independente da homologação da migração.
-- Requer 001 e níveis de acesso 202610150001. Suporta banco legado e registros v2.
-- Se aplicar 002 posteriormente, reaplique níveis de acesso e este arquivo.
do $$ begin
  if to_regprocedure('implanta_private.can_manage(text)') is null then
    raise exception 'Ative primeiro a migração de níveis de acesso (202610150001).';
  end if;
end $$;

-- No direct writes: the existing transactional writer enforces project access
-- and record revisions; these triggers additionally protect approvals/terms.
do $$
declare kind text; tbl text;
begin
  foreach kind in array array['implantation','implantation_module','implantation_question','implantation_term'] loop
    tbl := 'implanta_' || kind || '_records';
    execute format('create table if not exists public.%I (
      project_id text not null references public.implanta_projects(id) on delete cascade,
      id text not null, data jsonb not null check(jsonb_typeof(data)=''object''),
      revision bigint not null default 1, created_at timestamptz not null default now(),
      updated_at timestamptz, updated_by uuid references public.implanta_profiles(id) on delete set null,
      primary key(project_id,id))',tbl);
    execute format('alter table public.%I enable row level security',tbl);
    execute format('drop policy if exists record_read on public.%I',tbl);
    execute format('create policy record_read on public.%I for select to authenticated using (implanta_private.can_read(project_id))',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated',tbl);
    execute format('grant select on public.%I to authenticated',tbl);
    execute format('alter table public.%I disable trigger user',tbl);
    if to_regclass('implanta_private.record_tables') is not null then
      execute 'insert into implanta_private.record_tables(kind,relation) values($1,$2::regclass) on conflict(kind) do update set relation=excluded.relation' using kind,'public.' || tbl;
    end if;
  end loop;
end $$;

-- An optional later v2 cutover copies the legacy routine without rewriting
-- its signatures/timestamps. Existing v2 records always take precedence.
do $$
declare p record; value jsonb; e jsonb; q jsonb; t jsonb;
begin
  if to_regclass('public.implanta_municipality_records') is not null then
    for p in execute 'select m.project_id,m.data,p.data as legacy from public.implanta_municipality_records m join public.implanta_projects p on p.id=m.project_id' loop
      value := coalesce(p.data->'implantation',p.legacy->'implantation');
      if value is null or exists(select 1 from public.implanta_implantation_records where project_id=p.project_id) then continue; end if;
      insert into public.implanta_implantation_records(project_id,id,data) values(p.project_id,p.project_id,jsonb_build_object('version',1,'entryOrder',coalesce((select jsonb_agg(x->'id') from jsonb_array_elements(value->'entries') x),'[]')));
      for e in select * from jsonb_array_elements(value->'entries') loop
        insert into public.implanta_implantation_module_records(project_id,id,data) values(p.project_id,e->>'id',(e-'questions') || jsonb_build_object('questionOrder',coalesce((select jsonb_agg(x->'id') from jsonb_array_elements(e->'questions') x),'[]')));
        for q in select * from jsonb_array_elements(e->'questions') loop
          insert into public.implanta_implantation_question_records(project_id,id,data) values(p.project_id,format('[%s,%s]',to_jsonb(e->>'id')::text,to_jsonb(q->>'id')::text),jsonb_build_object('entryId',e->>'id','question',q));
        end loop;
      end loop;
      for t in select * from jsonb_array_elements(value->'terms') loop
        insert into public.implanta_implantation_term_records(project_id,id,data) values(p.project_id,t->>'id',t);
      end loop;
      execute 'update public.implanta_municipality_records set data=data-''implantation'' where project_id=$1' using p.project_id;
    end loop;
  end if;
end $$;

create or replace function implanta_private.implantation_identity() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('actorId',auth.uid(),'by',display_name,'at',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'source','server') from public.implanta_profiles where id=auth.uid()
$$;

create or replace function implanta_private.implantation_stamp_question(value jsonb, previous jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:=value; changed boolean; c jsonb; old_client jsonb; clients jsonb:='[]'; identity jsonb;
begin
  identity := implanta_private.implantation_identity();
  changed := (value-array['technical','clients']) is distinct from (previous-array['technical','clients']);
  if coalesce(value->'technical','null')<>'null'::jsonb then
    if value->'technical'->>'source'='imported-unverified' then null;
    elsif changed and value->'technical' is not distinct from previous->'technical' then result:=jsonb_set(result,'{technical}','null');
    elsif changed or value->'technical' is distinct from previous->'technical' then
      if identity is null then raise exception 'Entre com sua conta para confirmar a apresentação.' using errcode='42501'; end if;
      result:=jsonb_set(result,'{technical}',identity);
    end if;
  end if;
  for c in select * from jsonb_array_elements(coalesce(value->'clients','[]')) loop
    select x into old_client from jsonb_array_elements(coalesce(previous->'clients','[]')) x where x->>'id'=c->>'id';
    if c->>'source'='imported-unverified' then null;
    elsif changed and c is not distinct from old_client then continue;
    elsif changed or c is distinct from old_client then
      if identity is null then raise exception 'Entre com sua conta para registrar o aceite informado pelo cliente.' using errcode='42501'; end if;
      c := (c-array['actorId','by','at','source']) || identity;
    end if;
    clients:=clients || jsonb_build_array(c);
  end loop;
  return jsonb_set(result,'{clients}',clients);
end $$;

create or replace function implanta_private.implantation_validate(value jsonb) returns void
language plpgsql set search_path='' as $$
declare e jsonb; q jsonb; c jsonb; r jsonb;
begin
  if value->>'version' is distinct from '1' or jsonb_typeof(value->'entries') is distinct from 'array' or jsonb_typeof(value->'terms') is distinct from 'array' then raise exception 'Estrutura de homologação da implantação inválida.'; end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(value->'entries') x) then raise exception 'Módulos repetidos na implantação.'; end if;
  for e in select * from jsonb_array_elements(value->'entries') loop
    if e->>'module' not in ('Compras e Contratos','Almoxarifado','Patrimônio','Frota','Fiscalização de contrato','Elicita') or coalesce(e->>'entity','')='' or (e->>'id')::jsonb is distinct from jsonb_build_array(e->>'module',e->>'entity') or jsonb_typeof(e->'included') is distinct from 'boolean' or jsonb_typeof(e->'modelVersion') is distinct from 'string' or jsonb_typeof(e->'responsibles') is distinct from 'array' or jsonb_typeof(e->'questions') is distinct from 'array' then raise exception 'Escopo da implantação inválido.'; end if;
    if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(e->'responsibles') x) then raise exception 'Responsáveis repetidos.'; end if;
    for r in select * from jsonb_array_elements(e->'responsibles') loop
      if coalesce(r->>'id','')='' or coalesce(trim(r->>'name'),'')='' or coalesce(trim(r->>'role'),'')='' or jsonb_typeof(r->'email') is distinct from 'string' then raise exception 'Informe nome e cargo dos responsáveis.'; end if;
    end loop;
    if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(e->'questions') x) then raise exception 'Perguntas repetidas.'; end if;
    for q in select * from jsonb_array_elements(e->'questions') loop
      if coalesce(q->>'id','')='' or coalesce(trim(q->>'text'),'')='' or jsonb_typeof(q->'help') is distinct from 'string' or coalesce(q->>'kind','') not in ('capability','choice','blocking') or coalesce(q->>'justifyWhen','') not in ('yes','no') or coalesce(q->>'answer','invalid') not in ('','yes','no','na') or jsonb_typeof(q->'notes') is distinct from 'string' or jsonb_typeof(q->'responsibleIds') is distinct from 'array' or jsonb_typeof(q->'clients') is distinct from 'array' then raise exception 'Pergunta da implantação inválida.'; end if;
      if (select count(*)<>count(distinct x) from jsonb_array_elements_text(q->'responsibleIds') x) or exists(select 1 from jsonb_array_elements_text(q->'responsibleIds') i where not exists(select 1 from jsonb_array_elements(e->'responsibles') person where person->>'id'=i)) then raise exception 'Responsável do ponto não pertence ao módulo.'; end if;
      if (q->>'answer'='na' or q->>'answer'=q->>'justifyWhen') and coalesce(trim(q->>'notes'),'')='' then raise exception 'Justifique a resposta do checklist.'; end if;
      if (coalesce(q->'technical','null')<>'null'::jsonb or jsonb_array_length(q->'clients')>0) and q->>'answer'='' then raise exception 'Responda o ponto antes de registrar os OKs.'; end if;
      if coalesce(q->'technical','null')<>'null'::jsonb and (coalesce(q->'technical'->>'actorId','')='' or coalesce(q->'technical'->>'by','')='' or coalesce(q->'technical'->>'at','')='' or q->'technical'->>'source' not in ('server','imported-unverified')) then raise exception 'Identificação do técnico inválida.'; end if;
      if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(q->'clients') x) then raise exception 'Aceite do cliente repetido.'; end if;
      for c in select * from jsonb_array_elements(q->'clients') loop
        select x into r from jsonb_array_elements(e->'responsibles') x where x->>'id'=c->>'id';
        if not (q->'responsibleIds' ? (c->>'id')) or r is null or c->>'clientName' is distinct from r->>'name' or c->>'clientRole' is distinct from r->>'role' or coalesce(c->>'actorId','')='' or coalesce(c->>'by','')='' or coalesce(c->>'at','')='' or c->>'source' not in ('server','imported-unverified') then raise exception 'Confira os responsáveis e registre novamente os aceites alterados.'; end if;
      end loop;
    end loop;
  end loop;
end $$;

create or replace function implanta_private.implantation_ready(value jsonb, entity text, entities jsonb) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and entities ? entity)
  and not exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and (
    jsonb_array_length(e->'questions')=0 or exists(select 1 from jsonb_array_elements(e->'questions') q where
      q->>'answer'='' or (q->>'kind'='capability' and q->>'answer'='no') or (q->>'kind'='blocking' and q->>'answer'='yes') or
      coalesce(q->'technical'->>'source','')<>'server' or jsonb_array_length(q->'responsibleIds')=0 or
      exists(select 1 from jsonb_array_elements_text(q->'responsibleIds') id where not exists(select 1 from jsonb_array_elements(q->'clients') c where c->>'id'=id and c->>'source'='server')))))
$$;

create or replace function implanta_private.implantation_snapshot(project_data jsonb, value jsonb, entity text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('projectId',project_data->>'id','projectName',project_data->>'name','state',coalesce(project_data->>'state',''),'dream',coalesce(project_data->>'dream',''),'fiscal',coalesce(project_data->>'fiscal',''),'entity',entity,
    'entries',coalesce((select jsonb_agg(e) from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and project_data->'entities' ? entity),'[]'))
$$;

create or replace function implanta_private.implantation_verify_term(term jsonb, project_data jsonb, value jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if term->>'source'='imported-unverified' then
    perform implanta_private.implantation_validate(jsonb_build_object('version',1,'entries',term->'snapshot'->'entries','terms','[]'::jsonb));
    return;
  end if;
  if not implanta_private.implantation_ready(value,term->>'entity',project_data->'entities') then raise exception 'Resolva os impedimentos e registre todos os OKs antes de emitir o termo.'; end if;
  if term->'snapshot' is distinct from implanta_private.implantation_snapshot(project_data,value,term->>'entity') then raise exception 'Os dados mudaram. Atualize a homologação antes de gerar o termo.' using errcode='40001'; end if;
end $$;

-- Legacy: preserve the existing per-project CAS and merge protocol, but stamp
-- only changed approvals. Older clients cannot erase an omitted new routine.
create or replace function implanta_private.implantation_legacy_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare value jsonb; previous jsonb; e jsonb; old_entry jsonb; q jsonb; old_q jsonb; t jsonb; old_term jsonb; entries jsonb:='[]'; questions jsonb; terms jsonb:='[]'; identity jsonb;
begin
  if to_regclass('implanta_private.record_tables') is not null then return new; end if;
  previous:=case when tg_op='UPDATE' then old.data->'implantation' else null end;
  if previous is not null and not new.data ? 'implantation' then new.data:=new.data || jsonb_build_object('implantation',previous); end if;
  value:=new.data->'implantation';
  if value is null then return new; end if;
  if value is not distinct from previous then return new; end if;
  if not implanta_private.can_edit(new.id) and tg_op<>'INSERT' then raise exception 'Sem permissão para editar esta homologação.' using errcode='42501'; end if;
  for e in select * from jsonb_array_elements(value->'entries') loop
    select x into old_entry from jsonb_array_elements(coalesce(previous->'entries','[]')) x where x->>'id'=e->>'id';
    questions:='[]';
    for q in select * from jsonb_array_elements(e->'questions') loop
      select x into old_q from jsonb_array_elements(coalesce(old_entry->'questions','[]')) x where x->>'id'=q->>'id';
      q:=implanta_private.implantation_stamp_question(q,old_q);
      -- A name/cargo change cannot retain an old acknowledgement.
      q:=jsonb_set(q,'{clients}',coalesce((select jsonb_agg(c) from jsonb_array_elements(q->'clients') c where exists(select 1 from jsonb_array_elements(e->'responsibles') r where r->>'id'=c->>'id' and r->>'name'=c->>'clientName' and r->>'role'=c->>'clientRole')),'[]'));
      questions:=questions || jsonb_build_array(q);
    end loop;
    entries:=entries || jsonb_build_array(jsonb_set(e,'{questions}',questions));
  end loop;
  value:=jsonb_set(value,'{entries}',entries);
  perform implanta_private.implantation_validate(value);
  for t in select * from jsonb_array_elements(value->'terms') loop
    select x into old_term from jsonb_array_elements(coalesce(previous->'terms','[]')) x where x->>'id'=t->>'id';
    if old_term is not null then
      if t is distinct from old_term then
        -- Master restore may label an existing snapshot unverified, never edit it.
        if not implanta_private.admin() or t->>'source'<>'imported-unverified' then raise exception 'Termos emitidos não podem ser alterados.'; end if;
        t:=old_term;
      end if;
    else
      perform implanta_private.implantation_verify_term(t,new.data,value);
      if t->>'source' is distinct from 'imported-unverified' then
        identity:=implanta_private.implantation_identity();
        t:=t || jsonb_build_object('actorId',identity->'actorId','actorName',identity->'by','at',identity->'at','source','server');
      end if;
    end if;
    terms:=terms || jsonb_build_array(t);
  end loop;
  -- Preserve historical terms missing from an older backup.
  for t in select * from jsonb_array_elements(coalesce(previous->'terms','[]')) loop
    if not exists(select 1 from jsonb_array_elements(terms) x where x->>'id'=t->>'id') then terms:=terms || jsonb_build_array(t); end if;
  end loop;
  new.data:=jsonb_set(new.data,'{implantation}',jsonb_set(value,'{terms}',terms));
  return new;
end $$;
drop trigger if exists implanta_implantation_legacy_guard on public.implanta_projects;
create trigger implanta_implantation_legacy_guard before insert or update of data on public.implanta_projects for each row execute function implanta_private.implantation_legacy_guard();

create or replace function implanta_private.implantation_assembled(project text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('version',1,
    'entries',coalesce((select jsonb_agg((m.data-'questionOrder') || jsonb_build_object('questions',coalesce((select jsonb_agg(q.data->'question' order by coalesce((select ordinality from jsonb_array_elements_text(m.data->'questionOrder') with ordinality where value=q.data->'question'->>'id'),999999),q.id) from public.implanta_implantation_question_records q where q.project_id=project and q.data->>'entryId'=m.id),'[]')) order by coalesce((select ordinality from public.implanta_implantation_records h,jsonb_array_elements_text(h.data->'entryOrder') with ordinality where h.project_id=project and value=m.id),999999),m.id) from public.implanta_implantation_module_records m where m.project_id=project),'[]'),
    'terms',coalesce((select jsonb_agg(t.data order by t.data->>'at' desc) from public.implanta_implantation_term_records t where t.project_id=project),'[]'))
$$;

create or replace function implanta_private.implantation_record_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text:=tg_argv[0]; identity jsonb; previous jsonb;
begin
  if tg_op='DELETE' then
    if kind='implantation_term' and exists(select 1 from public.implanta_projects where id=old.project_id) then raise exception 'Termos emitidos não podem ser apagados isoladamente.'; end if;
    return old;
  end if;
  -- The generic writer uses INSERT ... ON CONFLICT UPDATE. BEFORE INSERT runs
  -- even for an existing row, so compare with that row before stamping.
  if tg_op='UPDATE' then previous:=old.data;
  else execute format('select data from %I.%I where project_id=$1 and id=$2',tg_table_schema,tg_table_name) into previous using new.project_id,new.id;
  end if;
  if kind='implantation' and (new.id<>new.project_id or new.data->>'version' is distinct from '1' or jsonb_typeof(new.data->'entryOrder') is distinct from 'array') then raise exception 'Identificação da homologação inválida.'; end if;
  if kind='implantation_module' and new.data->>'id' is distinct from new.id then raise exception 'Identificação do módulo inválida.'; end if;
  if kind='implantation_question' then
    if new.id::jsonb is distinct from jsonb_build_array(new.data->>'entryId',new.data->'question'->>'id') then raise exception 'Identificação da pergunta inválida.'; end if;
    new.data:=jsonb_set(new.data,'{question}',implanta_private.implantation_stamp_question(new.data->'question',previous->'question'));
  end if;
  if kind='implantation_term' then
    if new.data->>'id' is distinct from new.id then raise exception 'Identificação do termo inválida.'; end if;
    if previous is not null and new.data is distinct from previous then raise exception 'Termos emitidos não podem ser alterados.'; end if;
    if previous is null and new.data->>'source' is distinct from 'imported-unverified' then
      identity:=implanta_private.implantation_identity();
      if identity is null then raise exception 'Entre com sua conta para emitir o termo.' using errcode='42501'; end if;
      new.data:=new.data || jsonb_build_object('actorId',identity->'actorId','actorName',identity->'by','at',identity->'at','source','server');
    end if;
  end if;
  return new;
end $$;

create or replace function implanta_private.implantation_final_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare project text:=case when tg_op='DELETE' then old.project_id else new.project_id end; value jsonb; project_data jsonb;
begin
  if not exists(select 1 from public.implanta_projects where id=project) then return null; end if;
  value:=implanta_private.implantation_assembled(project);
  perform implanta_private.implantation_validate(value);
  if not exists(select 1 from public.implanta_implantation_records where project_id=project) or exists(select 1 from public.implanta_implantation_question_records q where q.project_id=project and not exists(select 1 from public.implanta_implantation_module_records m where m.project_id=project and m.id=q.data->>'entryId')) then raise exception 'Vínculo da homologação da implantação incompleto.'; end if;
  if tg_argv[0]='implantation_term' and tg_op='INSERT' then
    execute 'select data from public.implanta_municipality_records where project_id=$1' into project_data using project;
    perform implanta_private.implantation_verify_term(new.data,project_data,value);
  end if;
  return null;
end $$;
do $$ declare kind text; tbl text; begin
  foreach kind in array array['implantation','implantation_module','implantation_question','implantation_term'] loop
    tbl:='implanta_' || kind || '_records';
    execute format('drop trigger if exists implantation_guard on public.%I',tbl);
    execute format('create trigger implantation_guard before insert or update or delete on public.%I for each row execute function implanta_private.implantation_record_guard(%L)',tbl,kind);
    execute format('drop trigger if exists implantation_final_guard on public.%I',tbl);
    execute format('create constraint trigger implantation_final_guard after insert or update or delete on public.%I deferrable initially deferred for each row execute function implanta_private.implantation_final_guard(%L)',tbl,kind);
    execute format('alter table public.%I enable trigger user',tbl);
  end loop;
end $$;

-- The legacy writer normally returns void. Return canonical, stamped data from
-- the same transaction so this app displays the saved OKs immediately.
create or replace function public.implanta_commit_implantation(p_changes jsonb,p_removed jsonb,p_preferences jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
  perform public.implanta_commit(p_changes,p_removed,p_preferences);
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.data,'version',p.version)),'[]') into result from public.implanta_projects p where p.id in (select value->>'id' from jsonb_array_elements(p_changes)) and implanta_private.can_read(p.id);
  return result;
end $$;
create or replace function public.implanta_implantation_capabilities() returns jsonb
language plpgsql security definer set search_path='' as $$
declare count_kinds integer:=0;
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
  if to_regclass('implanta_private.record_tables') is not null then
    execute 'select count(*) from implanta_private.record_tables where kind in (''implantation'',''implantation_module'',''implantation_question'',''implantation_term'')' into count_kinds;
    if count_kinds<>4 then return jsonb_build_object('version',0); end if;
  end if;
  return jsonb_build_object('version',1);
end $$;
revoke all on function public.implanta_commit_implantation(jsonb,jsonb,jsonb),public.implanta_implantation_capabilities() from public,anon;
grant execute on function public.implanta_commit_implantation(jsonb,jsonb,jsonb),public.implanta_implantation_capabilities() to authenticated;
revoke all on function implanta_private.implantation_identity(),implanta_private.implantation_stamp_question(jsonb,jsonb),implanta_private.implantation_validate(jsonb),implanta_private.implantation_ready(jsonb,text,jsonb),implanta_private.implantation_snapshot(jsonb,jsonb,text),implanta_private.implantation_verify_term(jsonb,jsonb,jsonb),implanta_private.implantation_legacy_guard(),implanta_private.implantation_assembled(text),implanta_private.implantation_record_guard(),implanta_private.implantation_final_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
$acceptance_base_migration$;
 execute $acceptance_workflow_migration$
-- Complemento da homologação: modelos globais Master, dispensa justificada e termos por módulo.
-- Execute DEPOIS de 202610240001_implantation_acceptance.sql. Não reaplica estrutura nem apaga dados.
do $$ begin
 if to_regprocedure('public.implanta_implantation_capabilities()') is null then raise exception 'Execute primeiro 202610240001_implantation_acceptance.sql.'; end if;
end $$;
create table if not exists public.implanta_implantation_templates(
 module text primary key, version text not null, revision bigint not null default 1,
 questions jsonb not null check(jsonb_typeof(questions)='array'),
 updated_at timestamptz not null default now(),updated_by uuid references public.implanta_profiles(id) on delete set null
);
alter table public.implanta_implantation_templates enable row level security;
drop policy if exists templates_read on public.implanta_implantation_templates;
create policy templates_read on public.implanta_implantation_templates for select to authenticated using(implanta_private.enabled());
revoke all on public.implanta_implantation_templates from public,anon,authenticated;
grant select on public.implanta_implantation_templates to authenticated;
create or replace function implanta_private.implantation_definition(q jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',q->>'id','text',q->>'text','help',coalesce(q->>'help',''),'condition',coalesce(q->>'condition',''),'kind',q->>'kind','justifyWhen',q->>'justifyWhen')
$$;
create or replace function implanta_private.implantation_definitions(qs jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(implanta_private.implantation_definition(value) order by ordinality),'[]') from jsonb_array_elements(qs) with ordinality
$$;
insert into public.implanta_implantation_templates(module,version,questions) values('Compras e Contratos','2026-3','[{"id":"01","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Fornecedores?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Documentos do Fornecedores?","help":"Compras e Contratos » Cadastros » Enquadramento Pessoas » Fornecedor » Fornecedor » Aba Documentos","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Usuários estão aptos a efetuar a manutenção no cadastro de Certificados de Registro Cadastral?","help":"Compras e Contratos » Cadastros » Enquadramento Pessoas » Fornecedor » Fornecedor » Aba Certificado","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Gestor/Fiscal?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Comissões?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Usuários estão aptos a efetuar a manutenção e gerenciamento do Processo Administrativo?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Usuários estão aptos a efetuar a manutenção e gerenciamento dos Contratos e Aditivos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Usuários estão aptos a efetuar a manutenção e gerenciamento das Parcerias da Administração Pública (Lei 13.019/2014?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Usuários estão aptos a efetuar a manutenção das Ordens de Compra?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Usuários estão aptos a efetuar a manutenção das Requisições de Compras?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"12","text":"Usuários estão aptos a efetuar a manutenção das Solicitações de Compras?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"13","text":"Usuários estão aptos a efetuar a manutenção no DFD (Documento de Formalização de Demanda)?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"14","text":"Usuários estão aptos a efetuar a manutenção no ETP (Estudo Técnico Preliminar)?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"15","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"16","text":"Verificar se as possibilidades de preenchimento da Planilha de Preços pelo Portal de Serviços foram repassadas ao cliente:","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"17","text":"Layout da Requisição ao Compras foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"18","text":"Layout da Solicitação ao Compras foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"19","text":"Cliente optou por utilizar os Layouts dos Editais padrão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"20","text":"Cliente optou por utilizar os Layouts dos Contratos padrão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"21","text":"Cliente optou por utilizar os Layouts dos Pareceres padrão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"22","text":"Cliente optou por utilizar os Layouts das Atas de Pregão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"23","text":"Cliente optou por utilizar os Layouts das Atas de Registro de Preços do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"24","text":"Foi desenvolvido layouts para as Atas do Registro de Preços?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"25","text":"Foi repassado ao cliente como cadastrar as Revogações, Anulações e Recursos das licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"26","text":"Foi repassado ao cliente como utilizar as propostas eletrônicas no portal de serviços?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"27","text":"Foi repassado ao cliente como Desclassificar/Anular participantes e propostas e como isso afeta o fluxo após a etapa de lances?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"28","text":"Foi repassado ao cliente como realizar a Readequação de Lotes?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"29","text":"Foi ajustada a Adjudicação de todas as Licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"30","text":"Os saldos de todas as Licitações estão corretos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"31","text":"Os saldos de todos os Contratos estão corretos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"32","text":"Foi repassado como realizar a exportação e importação do Pregão Eletrônico?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"33","text":"Foi repassado como gerar Contratos para Compras Diretas ou sem vínculo com as Licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"34","text":"Foi repassado como é realizado o envio dos Arquivos via WebService ou E-validador (Licitacon)?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"35","text":"Foi repassado como consultar o Log de Erros?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"36","text":"Foi repassado como realizar o Ajuste de Numeração dos Contratos via “Reajuste TC”?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"37","text":"Foi repassado como realizar o Reajuste da Numeração das Comissões via “Reajuste TC”?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"38","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"39","text":"Foi repassado como corrige lançamentos dos Editais ao PNCP?","help":"Compras e Contratos » PNCP » Gerenciar » Editais","condition":"","kind":"capability","justifyWhen":"no"},{"id":"40","text":"Foi repassado como corrige lançamentos dos contratos ao PNCP?","help":"Compras e Contratos » PNCP » Gerenciar » Contratos","condition":"","kind":"capability","justifyWhen":"no"},{"id":"41","text":"Foi repassado como corrige lançamentos das ATAS ao PNCP ?","help":"Compras e Contratos » PNCP » Gerenciar » Atas RP","condition":"","kind":"capability","justifyWhen":"no"},{"id":"42","text":"Foi repassado como é feita a inclusão de ativos de contrato e seus respectivos tipos?","help":"Compras e Contratos » Gerenciar » Processo Administrativo » Gerenciamento do Processo Administrativo: XXX / 2026 - Processo de Inexigibilidade X / 2026 - MINUTA [XXXX / 2026 ] » Consultar Contratos » Consultar Aditivos dos Contratos Superiores - [XX/2026 - XXX]","condition":"","kind":"capability","justifyWhen":"no"},{"id":"43","text":"Foi repassado como é feita a inclusão de novos recursos na adjudicação?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"44","text":"Foi repassado como é feito o reajuste de valor dos itens do registro de preço e adicionar quantidades?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"45","text":"Cliente foi orientado de quais anexos obrigatórios e suas publicações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"46","text":"Cliente foi orientado de como Incluir relacionamento recurso x item?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"47","text":"Cliente optou por utilizar processo digital na requisição, ordem de compra e processo administrativo?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"48","text":"Existem pendências que impeçam o funcionamento do módulo Compras, Licitações e Contratos?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Almoxarifado','2026-3','[{"id":"01","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Comissões de Inventário?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Depósitos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Usuários estão aptos a efetuar a manutenção de Produtos x Depósitos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Usuários estão aptos a efetuar a manutenção das Entradas de Produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Layout das guias de Entrada foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Usuários estão aptos a efetuar a manutenção das Saídas de Produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Layout das guias de Saída foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Usuários estão aptos a incluir Transferência de Produtos entre Depósitos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Usuários estão aptos a efetuar a manutenção do Ponto de Ressuprimento?","help":"Suprimentos >> Almoxarifado >> Cadastros >> Depósito >> Produto x Depósito","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Usuários estão aptos a efetuar a Requisição ao Almoxarifado?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Layout da Guia de Requisição ao Almoxarifado está homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"12","text":"Usuários estão aptos a utilizar a rotina de Cotas de Consumo?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"13","text":"Usuários estão aptos a utilizar a rotina de Virada Mensal de Estoque?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"14","text":"A Entidade irá Efetuar Contabilização (Integração com a Contabilidade)?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"15","text":"Se a resposta anterior for SIM: Foi repassado como funcionam os cadastros de Classe Produto x Conta (apenas modo manual) e Classe Produto x Conta x Tipo de Movimentação (modo automático)?","help":"","condition":"Aplica-se quando a entidade fará integração com a contabilidade.","kind":"capability","justifyWhen":"no"},{"id":"16","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao Cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"17","text":"Existem pendências que impeçam o funcionamento do módulo Almoxarifado?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Patrimônio','2026-3','[{"id":"01","text":"Usuários estão aptos a efetuar a solicitação de cadastro de produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Usuários estão aptos a efetuar a manutenção dos Motivos de Baixa?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Usuários estão aptos a efetuar a manutenção das Taxas de Depreciação?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Usuários estão aptos a efetuar a manutenção do Cadastro de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Usuários estão aptos a efetuar a manutenção de Incorporação de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Usuários estão aptos a efetuar a manutenção de Inventários?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Usuários estão aptos a efetuar a manutenção de Agregação de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Usuários estão aptos a realizar Transferência de Bens Interna?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Usuários estão aptos a realizar Transferência de Bens Externa?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Usuários estão aptos a realizar Transferência de Bens por Entidade?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Layout do Termo de Transferência foi homologado com o usuário?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"12","text":"Usuários estão aptos a efetuar a Baixa de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"13","text":"Usuários estão aptos a utilizar a Movimentação Financeira?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"14","text":"O Balancete Patrimonial está fechando com o da Contabilidade? Se não, quais medidas foram tomadas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"15","text":"Foi repassado como funciona a Impressão de Etiquetas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"16","text":"Usuários estão aptos a efetuar a Virada Mensal?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"17","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao Cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"18","text":"Existem pendências que impeçam o completo funcionamento do módulo Patrimônio?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Frota','2026-3','[{"id":"01","text":"Os usuários estão aptos a efetuar a manutenção do cadastro de Motoristas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Os usuários estão aptos a efetuar a manutenção do cadastro de Rotas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Os usuários estão aptos a efetuar a manutenção do cadastro de Veículos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Os usuários estão aptos a efetuar a manutenção do Vencimento do IPVA?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Os usuários estão aptos a efetuar o Agendamento de Veículos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Os usuários estão aptos a utilizar a rotina de Despesa?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Os usuários estão aptos a utilizar a rotina de Manutenção?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Os usuários estão aptos a utilizar a rotina de Entradas/Saídas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Os usuários estão aptos a utilizar a rotina de Virada Anual?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao Cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Existem pendências que impeçam o funcionamento do módulo Frota?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Fiscalização de contrato','personalizado','[]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Elicita','personalizado','[]'::jsonb) on conflict(module) do nothing;

create or replace function public.implanta_implantation_templates() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('module',module,'version',version,'revision',revision,'questions',questions,'updatedAt',updated_at) order by module) from public.implanta_implantation_templates),'[]');
end $$;
create table if not exists public.implanta_implantation_template_audit(
 id bigint generated always as identity primary key,module text not null,revision bigint not null,
 actor_id uuid references public.implanta_profiles(id) on delete set null,actor_name text not null,
 at timestamptz not null default now(),before_data jsonb not null,after_data jsonb not null
);
alter table public.implanta_implantation_template_audit enable row level security;
drop policy if exists template_audit_read on public.implanta_implantation_template_audit;
create policy template_audit_read on public.implanta_implantation_template_audit for select to authenticated using(implanta_private.admin());
revoke all on public.implanta_implantation_template_audit from public,anon,authenticated;
grant select on public.implanta_implantation_template_audit to authenticated;
create or replace function public.implanta_save_implantation_template(p_module text,p_questions jsonb,p_revision bigint,p_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; result jsonb; previous jsonb; changed jsonb; actor text;
begin
 if not implanta_private.admin() then raise exception 'Somente o Master pode gerenciar modelos globais.' using errcode='42501'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' or octet_length(p_questions::text)>1048576 or coalesce(trim(p_version),'')='' then raise exception 'Modelo inválido.'; end if;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_questions) x) then raise exception 'Identificações de perguntas repetidas.'; end if;
 for q in select * from jsonb_array_elements(p_questions) loop
  if coalesce(q->>'id','')='' or coalesce(trim(q->>'text'),'')='' or coalesce(q->>'kind','') not in ('capability','choice','blocking') or coalesce(q->>'justifyWhen','') not in ('yes','no') or (q ? 'help' and jsonb_typeof(q->'help')<>'string') or (q ? 'condition' and jsonb_typeof(q->'condition')<>'string') then raise exception 'Confira texto, tipo e orientação de cada pergunta.'; end if;
 end loop;
 select to_jsonb(m) into previous from public.implanta_implantation_templates m where module=p_module for update;
 select display_name into actor from public.implanta_profiles where id=auth.uid();
 update public.implanta_implantation_templates set version=trim(p_version),questions=implanta_private.implantation_definitions(p_questions),revision=revision+1,updated_at=now(),updated_by=auth.uid() where module=p_module and revision=p_revision;
 if not found then raise exception 'Outro Master alterou este modelo. Recarregue antes de editar.' using errcode='40001'; end if;
 select to_jsonb(m) into changed from public.implanta_implantation_templates m where module=p_module;
 insert into public.implanta_implantation_template_audit(module,revision,actor_id,actor_name,before_data,after_data) values(p_module,(changed->>'revision')::bigint,auth.uid(),coalesce(actor,auth.uid()::text),previous,changed);
 return public.implanta_implantation_templates();
end $$;
create or replace function implanta_private.implantation_check_entry(value jsonb,previous jsonb) returns void language plpgsql security definer set search_path='' as $$
declare model public.implanta_implantation_templates%rowtype;
begin
 if previous->>'included'='true' and value->>'included'='true' and (value->'modelRevision' is distinct from previous->'modelRevision' or value->'modelVersion' is distinct from previous->'modelVersion') and not implanta_private.admin() then raise exception 'Somente o Master pode atualizar o modelo do relatório.' using errcode='42501'; end if;
 if previous->>'included'='true' and value->>'included'='false' and jsonb_array_length(value->'questions')<>0 then raise exception 'Desativar o relatório exige apagar as respostas após confirmação.'; end if;
 if value->>'included'='false' and jsonb_array_length(value->'questions')=0 then return; end if;
 if previous is not null and implanta_private.implantation_definitions(value->'questions')=implanta_private.implantation_definitions(previous->'questions') then return; end if;
 if not implanta_private.admin() then
  if previous is not null and previous->>'included'='true' then raise exception 'Somente o Master pode editar perguntas.' using errcode='42501'; end if;
  select * into model from public.implanta_implantation_templates where module=value->>'module';
  if model.module is null or jsonb_array_length(model.questions)=0 then raise exception 'Cadastre primeiro um modelo global de perguntas para este módulo.'; end if;
  if coalesce(value->>'modelRevision','0')::bigint<>model.revision or implanta_private.implantation_definitions(value->'questions')<>model.questions then raise exception 'Atualize os modelos antes de ativar o relatório.' using errcode='40001'; end if;
 end if;
end $$;

create or replace function implanta_private.implantation_stamp_question(value jsonb, previous jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:=value; changed boolean; technical_changed boolean; c jsonb; old_client jsonb; clients jsonb:='[]'; identity jsonb;
begin
  identity := implanta_private.implantation_identity();
  changed := (value-array['technical','clients']) is distinct from (previous-array['technical','clients']);
  technical_changed := (value-array['technical','clients','responsibleIds']) is distinct from (previous-array['technical','clients','responsibleIds']);
  if coalesce(value->'technical','null')<>'null'::jsonb then
    if value->'technical'->>'source'='imported-unverified' then null;
    elsif technical_changed and value->'technical' is not distinct from previous->'technical' then result:=jsonb_set(result,'{technical}','null');
    elsif technical_changed or value->'technical' is distinct from previous->'technical' then
      if identity is null then raise exception 'Entre com sua conta para confirmar a apresentação.' using errcode='42501'; end if;
      result:=jsonb_set(result,'{technical}',identity);
    end if;
  end if;
  for c in select * from jsonb_array_elements(coalesce(value->'clients','[]')) loop
    select x into old_client from jsonb_array_elements(coalesce(previous->'clients','[]')) x where x->>'id'=c->>'id';
    if c->>'source'='imported-unverified' then null;
    elsif changed and c is not distinct from old_client then continue;
    elsif changed or c is distinct from old_client then
      if identity is null then raise exception 'Entre com sua conta para registrar o aceite informado pelo cliente.' using errcode='42501'; end if;
      c := (c-array['actorId','by','at','source']) || identity;
    end if;
    clients:=clients || jsonb_build_array(c);
  end loop;
  return jsonb_set(result,'{clients}',clients);
end $$;
create or replace function implanta_private.implantation_validate(value jsonb) returns void
language plpgsql set search_path='' as $$
declare e jsonb; q jsonb; c jsonb; r jsonb;
begin
  if value->>'version' is distinct from '1' or jsonb_typeof(value->'entries') is distinct from 'array' or jsonb_typeof(value->'terms') is distinct from 'array' then raise exception 'Estrutura de homologação da implantação inválida.'; end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(value->'entries') x) then raise exception 'Módulos repetidos na implantação.'; end if;
  for e in select * from jsonb_array_elements(value->'entries') loop
    if e->>'module' not in ('Compras e Contratos','Almoxarifado','Patrimônio','Frota','Fiscalização de contrato','Elicita') or coalesce(e->>'entity','')='' or (e->>'id')::jsonb is distinct from jsonb_build_array(e->>'module',e->>'entity') or jsonb_typeof(e->'included') is distinct from 'boolean' or jsonb_typeof(e->'modelVersion') is distinct from 'string' or jsonb_typeof(e->'responsibles') is distinct from 'array' or jsonb_typeof(e->'questions') is distinct from 'array' then raise exception 'Escopo da implantação inválido.'; end if;
    if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(e->'responsibles') x) then raise exception 'Responsáveis repetidos.'; end if;
    for r in select * from jsonb_array_elements(e->'responsibles') loop
      if coalesce(r->>'id','')='' or coalesce(trim(r->>'name'),'')='' or coalesce(trim(r->>'role'),'')='' or jsonb_typeof(r->'email') is distinct from 'string' then raise exception 'Informe nome e cargo dos responsáveis.'; end if;
    end loop;
    if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(e->'questions') x) then raise exception 'Perguntas repetidas.'; end if;
    for q in select * from jsonb_array_elements(e->'questions') loop
      if coalesce(q->>'id','')='' or coalesce(trim(q->>'text'),'')='' or jsonb_typeof(q->'help') is distinct from 'string' or coalesce(q->>'kind','') not in ('capability','choice','blocking') or coalesce(q->>'justifyWhen','') not in ('yes','no') or coalesce(q->>'answer','invalid') not in ('','yes','no','na') or jsonb_typeof(q->'notes') is distinct from 'string' or jsonb_typeof(q->'responsibleIds') is distinct from 'array' or jsonb_typeof(q->'clients') is distinct from 'array' then raise exception 'Pergunta da implantação inválida.'; end if;
      if (select count(*)<>count(distinct x) from jsonb_array_elements_text(q->'responsibleIds') x) or exists(select 1 from jsonb_array_elements_text(q->'responsibleIds') i where not exists(select 1 from jsonb_array_elements(e->'responsibles') person where person->>'id'=i)) then raise exception 'Responsável do ponto não pertence ao módulo.'; end if;
      if q ? 'notUsed' and (jsonb_typeof(q->'notUsed') is distinct from 'boolean' or (q->>'notUsed'='true' and (q->>'answer'<>'no' or q->>'kind'='blocking'))) then raise exception 'A dispensa exige resposta Não e justificativa.'; end if;
      if (q->>'answer'='na' or q->>'answer'=q->>'justifyWhen' or q->>'notUsed'='true') and coalesce(trim(q->>'notes'),'')='' and (coalesce(q->'technical','null')<>'null'::jsonb or jsonb_array_length(q->'clients')>0) then raise exception 'Justifique a resposta do checklist.'; end if;
      if (coalesce(q->'technical','null')<>'null'::jsonb or jsonb_array_length(q->'clients')>0) and q->>'answer'='' then raise exception 'Responda o ponto antes de registrar os OKs.'; end if;
      if coalesce(q->'technical','null')<>'null'::jsonb and (coalesce(q->'technical'->>'actorId','')='' or coalesce(q->'technical'->>'by','')='' or coalesce(q->'technical'->>'at','')='' or q->'technical'->>'source' not in ('server','imported-unverified')) then raise exception 'Identificação do técnico inválida.'; end if;
      if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(q->'clients') x) then raise exception 'Aceite do cliente repetido.'; end if;
      for c in select * from jsonb_array_elements(q->'clients') loop
        select x into r from jsonb_array_elements(e->'responsibles') x where x->>'id'=c->>'id';
        if not (q->'responsibleIds' ? (c->>'id')) or r is null or c->>'clientName' is distinct from r->>'name' or c->>'clientRole' is distinct from r->>'role' or coalesce(c->>'actorId','')='' or coalesce(c->>'by','')='' or coalesce(c->>'at','')='' or c->>'source' not in ('server','imported-unverified') then raise exception 'Confira os responsáveis e registre novamente os aceites alterados.'; end if;
      end loop;
    end loop;
  end loop;
end $$;
create or replace function implanta_private.implantation_ready(value jsonb, entity text, entities jsonb, module text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and entities ? entity and (module='' or e->>'module'=module))
 and not exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and (module='' or e->>'module'=module) and (
 jsonb_array_length(e->'questions')=0 or exists(select 1 from jsonb_array_elements(e->'questions') q where
 coalesce(q->>'answer','')='' or ((q->>'answer'='na' or q->>'answer'=q->>'justifyWhen' or q->>'notUsed'='true') and coalesce(trim(q->>'notes'),'')='') or
 (q->>'kind'='capability' and q->>'answer'='no' and coalesce(q->>'notUsed','false')<>'true') or (q->>'kind'='blocking' and q->>'answer'='yes') or
 coalesce(q->'technical'->>'source','')<>'server' or jsonb_array_length(q->'responsibleIds')=0 or
 exists(select 1 from jsonb_array_elements_text(q->'responsibleIds') id where not exists(select 1 from jsonb_array_elements(q->'clients') c where c->>'id'=id and c->>'source'='server')))))
$$;
create or replace function implanta_private.implantation_ready(value jsonb, entity text, entities jsonb) returns boolean language sql stable set search_path='' as $$ select implanta_private.implantation_ready(value,entity,entities,'') $$;
create or replace function implanta_private.implantation_snapshot(project_data jsonb,value jsonb,entity text,module text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('projectId',project_data->>'id','projectName',project_data->>'name','state',coalesce(project_data->>'state',''),'dream',coalesce(project_data->>'dream',''),'fiscal',coalesce(project_data->>'fiscal',''),'entity',entity,
 'entries',coalesce((select jsonb_agg(e) from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and project_data->'entities' ? entity and (module='' or e->>'module'=module)),'[]')) || case when module='' then '{}'::jsonb else jsonb_build_object('module',module) end
$$;
create or replace function implanta_private.implantation_snapshot(project_data jsonb,value jsonb,entity text) returns jsonb language sql stable set search_path='' as $$ select implanta_private.implantation_snapshot(project_data,value,entity,'') $$;

create or replace function implanta_private.implantation_verify_term(term jsonb, project_data jsonb, value jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if coalesce(term->>'module','')<>'' and (term->'snapshot'->>'module' is distinct from term->>'module' or exists(select 1 from jsonb_array_elements(term->'snapshot'->'entries') e where e->>'module' is distinct from term->>'module')) then raise exception 'Escopo do termo por módulo inválido.'; end if;
  if term->>'source'='imported-unverified' then
    perform implanta_private.implantation_validate(jsonb_build_object('version',1,'entries',term->'snapshot'->'entries','terms','[]'::jsonb));
    return;
  end if;
  if not implanta_private.implantation_ready(value,term->>'entity',project_data->'entities',coalesce(term->>'module','')) then raise exception 'Resolva os impedimentos e registre todos os OKs antes de emitir o termo.'; end if;
  if term->'snapshot' is distinct from implanta_private.implantation_snapshot(project_data,value,term->>'entity',coalesce(term->>'module','')) then raise exception 'Os dados mudaram. Atualize a homologação antes de gerar o termo.' using errcode='40001'; end if;
end $$;
-- An already-entered legacy create RPC must not create a snapshot-only project
-- after cutover. The v2 RPC creates its municipality in the same transaction.
create or replace function implanta_private.implantation_project_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('implanta_private.record_tables') is not null and exists(select 1 from public.implanta_projects where id=new.id) then
  if not exists(select 1 from public.implanta_municipality_records where project_id=new.id and id=new.id) then
   raise exception 'O banco usa registros separados. Atualize o aplicativo antes de criar projetos.' using errcode='55000';
  end if;
 end if;
 return null;
end $$;
revoke all on function implanta_private.implantation_project_created() from public,anon,authenticated;
drop trigger if exists implanta_implantation_project_created on public.implanta_projects;
create constraint trigger implanta_implantation_project_created after insert on public.implanta_projects deferrable initially deferred for each row execute function implanta_private.implantation_project_created();
create or replace function implanta_private.implantation_legacy_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare value jsonb; previous jsonb; e jsonb; old_entry jsonb; q jsonb; old_q jsonb; t jsonb; old_term jsonb; entries jsonb:='[]'; questions jsonb; terms jsonb:='[]'; identity jsonb;
begin
  if to_regclass('implanta_private.record_tables') is not null then
    -- Retained snapshots are read-only after cutover, including old RPCs that
    -- began before migration and resumed after the table lock was released.
    if tg_op='UPDATE' and new.data is distinct from old.data then
      raise exception 'O banco usa registros separados. Atualize o aplicativo antes de salvar.' using errcode='55000';
    end if;
    return new;
  end if;
  previous:=case when tg_op='UPDATE' then old.data->'implantation' else null end;
  if previous is not null and not new.data ? 'implantation' then new.data:=new.data || jsonb_build_object('implantation',previous); end if;
  value:=new.data->'implantation';
  if value is null then return new; end if;
  if value is not distinct from previous then return new; end if;
  if not implanta_private.can_edit(new.id) and tg_op<>'INSERT' then raise exception 'Sem permissão para editar esta homologação.' using errcode='42501'; end if;
  for e in select * from jsonb_array_elements(value->'entries') loop
    select x into old_entry from jsonb_array_elements(coalesce(previous->'entries','[]')) x where x->>'id'=e->>'id';
    perform implanta_private.implantation_check_entry(e,old_entry);
    questions:='[]';
    for q in select * from jsonb_array_elements(e->'questions') loop
      select x into old_q from jsonb_array_elements(coalesce(old_entry->'questions','[]')) x where x->>'id'=q->>'id';
      q:=implanta_private.implantation_stamp_question(q,old_q);
      -- A name/cargo change cannot retain an old acknowledgement.
      q:=jsonb_set(q,'{clients}',coalesce((select jsonb_agg(c) from jsonb_array_elements(q->'clients') c where exists(select 1 from jsonb_array_elements(e->'responsibles') r where r->>'id'=c->>'id' and r->>'name'=c->>'clientName' and r->>'role'=c->>'clientRole')),'[]'));
      questions:=questions || jsonb_build_array(q);
    end loop;
    entries:=entries || jsonb_build_array(jsonb_set(e,'{questions}',questions));
  end loop;
  value:=jsonb_set(value,'{entries}',entries);
  perform implanta_private.implantation_validate(value);
  for t in select * from jsonb_array_elements(value->'terms') loop
    select x into old_term from jsonb_array_elements(coalesce(previous->'terms','[]')) x where x->>'id'=t->>'id';
    if old_term is not null then
      if t is distinct from old_term then
        -- Master restore may label an existing snapshot unverified, never edit it.
        if not implanta_private.admin() or t->>'source'<>'imported-unverified' then raise exception 'Termos emitidos não podem ser alterados.'; end if;
        t:=old_term;
      end if;
    else
      perform implanta_private.implantation_verify_term(t,new.data,value);
      if t->>'source' is distinct from 'imported-unverified' then
        identity:=implanta_private.implantation_identity();
        t:=t || jsonb_build_object('actorId',identity->'actorId','actorName',identity->'by','at',identity->'at','source','server');
      end if;
    end if;
    terms:=terms || jsonb_build_array(t);
  end loop;
  -- Preserve historical terms missing from an older backup.
  for t in select * from jsonb_array_elements(coalesce(previous->'terms','[]')) loop
    if not exists(select 1 from jsonb_array_elements(terms) x where x->>'id'=t->>'id') then terms:=terms || jsonb_build_array(t); end if;
  end loop;
  new.data:=jsonb_set(new.data,'{implantation}',jsonb_set(value,'{terms}',terms));
  return new;
end $$;

-- Only trusted module transitions authorize editor creation of standard points.
create or replace function implanta_private.implantation_policy_prepare() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb; flags jsonb; key text;
begin
 if tg_op='UPDATE' then previous:=old.data; else select data into previous from public.implanta_implantation_module_records where project_id=new.project_id and id=new.id; end if;
 if new.data->>'included'='true' and (previous is null or previous->>'included'='false') then
  flags:=coalesce(nullif(current_setting('implanta.acceptance_activations',true),'')::jsonb,'{}');
  key:=jsonb_build_array(new.project_id,new.id)::text;
  perform set_config('implanta.acceptance_activations',(flags || jsonb_build_object(key,true))::text,true);
 end if;
 if previous->>'included'='true' and new.data->>'included'='true' and (new.data->'modelRevision' is distinct from previous->'modelRevision' or new.data->'modelVersion' is distinct from previous->'modelVersion' or new.data->'questionOrder' is distinct from previous->'questionOrder') and not implanta_private.admin() then raise exception 'Somente o Master pode atualizar as perguntas do relatório.' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists implantation_policy_prepare on public.implanta_implantation_module_records;
create trigger implantation_policy_prepare before insert or update on public.implanta_implantation_module_records for each row execute function implanta_private.implantation_policy_prepare();
create or replace function implanta_private.implantation_policy_final() returns trigger language plpgsql security definer set search_path='' as $$
declare project text; entry text; m jsonb; model public.implanta_implantation_templates%rowtype; flags jsonb; e jsonb;
begin
 project:=case when tg_op='DELETE' then old.project_id else new.project_id end;
 if not exists(select 1 from public.implanta_projects where id=project) then return null; end if;
 flags:=coalesce(nullif(current_setting('implanta.acceptance_activations',true),'')::jsonb,'{}');
 if tg_argv[0]='module' then
  if tg_op='DELETE' and not implanta_private.admin() then raise exception 'Desative o relatório para apagar suas respostas.' using errcode='42501'; end if;
  if tg_op<>'DELETE' then
   if tg_op='UPDATE' and old.data->>'included'='true' and new.data->>'included'='false' then
    if exists(select 1 from public.implanta_implantation_question_records where project_id=project and data->>'entryId'=new.id) then raise exception 'Desativar o relatório exige apagar suas respostas.'; end if;
   end if;
   if new.data->>'included'='true' and (tg_op='INSERT' or old.data->>'included'='false') then
    select * into model from public.implanta_implantation_templates where module=new.data->>'module';
    if model.module is null or jsonb_array_length(model.questions)=0 then raise exception 'Este módulo não possui modelo de perguntas.'; end if;
    if not implanta_private.admin() then
     e:=new.data || jsonb_build_object('questions',coalesce((select jsonb_agg(q.data->'question' order by coalesce((select ordinality from jsonb_array_elements_text(new.data->'questionOrder') with ordinality where value=q.data->'question'->>'id'),999999)) from public.implanta_implantation_question_records q where q.project_id=project and q.data->>'entryId'=new.id),'[]'));
     if coalesce(new.data->>'modelRevision','0')::bigint<>model.revision or implanta_private.implantation_definitions(e->'questions')<>model.questions then raise exception 'Atualize o modelo antes de ativar o relatório.' using errcode='40001'; end if;
    end if;
   end if;
  end if;
 else
  entry:=case when tg_op='DELETE' then old.data->>'entryId' else new.data->>'entryId' end;
  select data into m from public.implanta_implantation_module_records where project_id=project and id=entry;
  if tg_op='DELETE' then
   if m->>'included'='true' and not implanta_private.admin() then raise exception 'Somente o Master pode excluir perguntas de um relatório ativo.' using errcode='42501'; end if;
  elsif (tg_op='INSERT' or implanta_private.implantation_definition(new.data->'question') is distinct from implanta_private.implantation_definition(old.data->'question')) and not implanta_private.admin() then
   if tg_op='UPDATE' or not flags ? (jsonb_build_array(project,entry)::text) then raise exception 'Somente o Master pode editar perguntas.' using errcode='42501'; end if;
   select * into model from public.implanta_implantation_templates where module=m->>'module';
   if not exists(select 1 from jsonb_array_elements(model.questions) q where q=implanta_private.implantation_definition(new.data->'question')) then raise exception 'Use as perguntas do modelo global.' using errcode='42501'; end if;
  end if;
 end if;
 return null;
end $$;
drop trigger if exists implantation_policy_final on public.implanta_implantation_module_records;
create constraint trigger implantation_policy_final after insert or update or delete on public.implanta_implantation_module_records deferrable initially deferred for each row execute function implanta_private.implantation_policy_final('module');
drop trigger if exists implantation_policy_final on public.implanta_implantation_question_records;
create constraint trigger implantation_policy_final after insert or update or delete on public.implanta_implantation_question_records deferrable initially deferred for each row execute function implanta_private.implantation_policy_final('question');
create or replace function public.implanta_implantation_capabilities() returns jsonb language plpgsql security definer set search_path='' as $$
declare count_kinds integer:=0;
begin
 if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
 if to_regclass('implanta_private.record_tables') is not null then
  execute 'select count(*) from implanta_private.record_tables where kind in (''implantation'',''implantation_module'',''implantation_question'',''implantation_term'')' into count_kinds;
  if count_kinds<>4 then return jsonb_build_object('version',0); end if;
 end if;
 return jsonb_build_object('version',1,'workflowVersion',2);
end $$;
revoke all on function public.implanta_implantation_templates(),public.implanta_save_implantation_template(text,jsonb,bigint,text) from public,anon;
grant execute on function public.implanta_implantation_templates(),public.implanta_save_implantation_template(text,jsonb,bigint,text) to authenticated;
revoke all on function implanta_private.implantation_definition(jsonb),implanta_private.implantation_definitions(jsonb),implanta_private.implantation_check_entry(jsonb,jsonb),implanta_private.implantation_policy_prepare(),implanta_private.implantation_policy_final(),implanta_private.implantation_ready(jsonb,text,jsonb,text),implanta_private.implantation_snapshot(jsonb,jsonb,text,text) from public,anon,authenticated;

-- Bulk activation (up to many entities) validates the full state once, not once
-- per point. Any further write resets the marker, including immediate constraints.
create index if not exists implanta_question_by_module on public.implanta_implantation_question_records(project_id,(data->>'entryId'));
create or replace function implanta_private.implantation_validation_dirty() returns trigger language plpgsql security definer set search_path='' as $$
declare project text:=case when tg_op='DELETE' then old.project_id else new.project_id end; flags jsonb;
begin
 flags:=coalesce(nullif(current_setting('implanta.acceptance_validated',true),'')::jsonb,'{}');
 perform set_config('implanta.acceptance_validated',(flags-project)::text,true);
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare kind text; begin
 foreach kind in array array['implantation','implantation_module','implantation_question','implantation_term'] loop
 execute format('drop trigger if exists implantation_validation_dirty on public.implanta_%s_records',kind);
 execute format('create trigger implantation_validation_dirty before insert or update or delete on public.implanta_%s_records for each row execute function implanta_private.implantation_validation_dirty()',kind);
 end loop;
end $$;
create or replace function implanta_private.implantation_final_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare project text:=case when tg_op='DELETE' then old.project_id else new.project_id end; value jsonb; project_data jsonb; flags jsonb;
begin
 if not exists(select 1 from public.implanta_projects where id=project) then return null; end if;
 flags:=coalesce(nullif(current_setting('implanta.acceptance_validated',true),'')::jsonb,'{}');
 if not flags ? project then
  value:=implanta_private.implantation_assembled(project);
  perform implanta_private.implantation_validate(value);
  if not exists(select 1 from public.implanta_implantation_records where project_id=project) or exists(select 1 from public.implanta_implantation_question_records q where q.project_id=project and not exists(select 1 from public.implanta_implantation_module_records m where m.project_id=project and m.id=q.data->>'entryId')) then raise exception 'Vínculo da homologação incompleto.'; end if;
  perform set_config('implanta.acceptance_validated',(flags || jsonb_build_object(project,true))::text,true);
 end if;
 if tg_argv[0]='implantation_term' and tg_op='INSERT' then
  if value is null then value:=implanta_private.implantation_assembled(project); end if;
  execute 'select data from public.implanta_municipality_records where project_id=$1' into project_data using project;
  perform implanta_private.implantation_verify_term(new.data,project_data,value);
 end if;
 return null;
end $$;
revoke all on function implanta_private.implantation_validation_dirty() from public,anon,authenticated;

notify pgrst,'reload schema';
$acceptance_workflow_migration$;
end
$acceptance_activation$;
notify pgrst,'reload schema';
commit;
