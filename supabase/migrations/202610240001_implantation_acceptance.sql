-- Homologação da implantação. Adição independente da homologação da migração.
-- Requer 001 e níveis de acesso 202610150001. Suporta banco legado e registros v2.
-- Se aplicar 002 posteriormente, reaplique níveis de acesso e este arquivo.
begin;
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
commit;
