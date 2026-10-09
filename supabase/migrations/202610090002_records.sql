-- REVIEW / STAGING FIRST. Additive cutover, no deletion of legacy project snapshots.
-- Requires 202610090001_implanta.sql. Publish the compatible client before applying.
begin;

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
commit;
