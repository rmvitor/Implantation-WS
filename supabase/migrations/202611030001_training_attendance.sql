-- Implanta 1.19 — listas de presença independentes; sem alterar dados existentes.
-- Execute após registros separados e gestão por projeto (202610150001).
begin;
set local lock_timeout='15s';
do $$ begin
 if to_regclass('public.implanta_municipality_records') is null or to_regclass('implanta_private.role_settings') is null then raise exception 'Ative primeiro os registros separados e os níveis Master/gestor.'; end if;
end $$;
create table if not exists implanta_private.attendance_lists(
 id uuid primary key default gen_random_uuid(),
 project_id text not null references public.implanta_projects(id) on delete cascade,
 data jsonb not null, revision integer not null default 1,
 token_hash text, expires_at timestamptz, signup_open boolean not null default false,
 created_by uuid references public.implanta_profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists attendance_project on implanta_private.attendance_lists(project_id,created_at desc);
create unique index if not exists attendance_link on implanta_private.attendance_lists(token_hash) where token_hash is not null;
create table if not exists implanta_private.attendance_people(
 id uuid primary key, list_id uuid not null references implanta_private.attendance_lists(id) on delete cascade,
 name text not null, cpf text not null default '', sector text not null default '', email text not null default '',
 confirmed boolean not null default false, origin text not null check(origin in ('manual','public')),
 created_by uuid references public.implanta_profiles(id) on delete set null,
 created_at timestamptz not null default now(), confirmed_at timestamptz, updated_at timestamptz not null default now(),
 revision integer not null default 1
);
create unique index if not exists attendance_unique_mail on implanta_private.attendance_people(list_id,lower(email)) where email<>'';
create index if not exists attendance_people_list on implanta_private.attendance_people(list_id,created_at,id);
create table if not exists implanta_private.attendance_audit(
 id bigint generated always as identity primary key, list_id uuid not null references implanta_private.attendance_lists(id) on delete cascade,
 participant_id uuid, actor_id uuid, actor_name text not null default '', action text not null, at timestamptz not null default now()
);
alter table implanta_private.attendance_lists enable row level security;
alter table implanta_private.attendance_people enable row level security;
alter table implanta_private.attendance_audit enable row level security;
revoke all on implanta_private.attendance_lists,implanta_private.attendance_people,implanta_private.attendance_audit from public,anon,authenticated;

create or replace function implanta_private.attendance_audit_stamp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.actor_name:=case when new.actor_id is null then 'Participante externo' else coalesce((select display_name from public.implanta_profiles where id=new.actor_id),'Usuário removido') end;
 return new;
end $$;
drop trigger if exists attendance_audit_stamp on implanta_private.attendance_audit;
create trigger attendance_audit_stamp before insert on implanta_private.attendance_audit for each row execute function implanta_private.attendance_audit_stamp();

create or replace function implanta_private.attendance_edit(p_project text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(2026100901);
 perform 1 from public.implanta_projects where id=p_project for update;
 if not found then raise exception 'Lista ou projeto indisponível.' using errcode='42501'; end if;
 if not implanta_private.can_edit(p_project) then raise exception 'Sem permissão para editar esta lista.' using errcode='42501'; end if;
 if exists(select 1 from public.implanta_municipality_records where project_id=p_project and data->>'status'='closed') then raise exception 'Reabra o projeto para alterar suas listas.'; end if;
end $$;
create or replace function implanta_private.attendance_person(p_data jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare n text:=trim(p_data->>'name'); c text:=regexp_replace(coalesce(p_data->>'cpf',''),'[^0-9]','','g'); e text:=lower(trim(coalesce(p_data->>'email',''))); s text:=trim(coalesce(p_data->>'sector','')); digits integer[]; total integer; j integer; k integer;
begin
 if n is null or length(n)<2 or length(n)>200 or length(s)>200 or length(e)>254 or (e<>'' and e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Confira nome, setor e e-mail do participante.' using errcode='23514'; end if;
 if c<>'' then
  if length(c)<>11 or c=repeat(substr(c,1,1),11) then raise exception 'CPF inválido.' using errcode='23514'; end if;
  digits:=array(select substr(c,i,1)::integer from generate_series(1,11) i);
  for k in 10..11 loop
   total:=0; for j in 1..(k-1) loop total:=total+digits[j]*(k+1-j); end loop;
   total:=(total*10)%11; if total=10 then total:=0; end if;
   if total<>digits[k] then raise exception 'CPF inválido.' using errcode='23514'; end if;
  end loop;
 end if;
 return jsonb_build_object('name',n,'cpf',c,'sector',s,'email',e);
end $$;
create or replace function public.implanta_attendance_lists(p_project text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not implanta_private.can_read(p_project) then raise exception 'Sem acesso ao projeto.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(l)-'token_hash'||jsonb_build_object('count',(select count(*) from implanta_private.attendance_people p where p.list_id=l.id)) order by l.created_at desc) from implanta_private.attendance_lists l where project_id=p_project),'[]');
end $$;
create or replace function public.implanta_attendance_save(p_project text,p_id uuid,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists; d jsonb; training text:=nullif(p_data->>'trainingId',''); field text;
begin
 perform implanta_private.attendance_edit(p_project);
 foreach field in array array['title','entity','city','state','system','module','submodules','instructor','hours','date'] loop
  if coalesce(jsonb_typeof(p_data->field),'null')<>'string' or length(p_data->>field)>500 then raise exception 'Confira os dados do treinamento.' using errcode='23514'; end if;
 end loop;
 if trim(p_data->>'title')='' or trim(p_data->>'entity')='' or trim(p_data->>'instructor')='' or (p_data->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe título, entidade, instrutor e data.' using errcode='23514'; end if;
 perform (p_data->>'date')::date;
 if training is not null and not exists(select 1 from public.implanta_training_records where project_id=p_project and id=training) then raise exception 'O treinamento vinculado não pertence a este projeto.' using errcode='23514'; end if;
 select jsonb_object_agg(key,value) into d from jsonb_each(p_data) where key=any(array['title','entity','city','state','system','module','submodules','instructor','hours','date','trainingId']);
 if p_revision=0 then
  insert into implanta_private.attendance_lists(id,project_id,data,created_by) values(p_id,p_project,d,auth.uid()) returning * into l;
 else
  update implanta_private.attendance_lists set data=d,revision=revision+1,updated_at=now() where id=p_id and project_id=p_project and revision=p_revision returning * into l;
  if l.id is null then raise exception 'Esta lista foi alterada. Recarregue antes de salvar.' using errcode='40001'; end if;
 end if;
 insert into implanta_private.attendance_audit(list_id,actor_id,action) values(l.id,auth.uid(),case when p_revision=0 then 'list_created' else 'list_updated' end);
 return to_jsonb(l)-'token_hash';
end $$;
create or replace function public.implanta_attendance_read(p_id uuid,p_full_cpf boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists; people jsonb; history jsonb;
begin
 select * into l from implanta_private.attendance_lists where id=p_id;
 if l.id is null or not implanta_private.can_read(l.project_id) then raise exception 'Lista indisponível.' using errcode='42501'; end if;
 if p_full_cpf and not implanta_private.admin() then raise exception 'CPF completo restrito ao Master.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'cpf',case when p.cpf='' then '' when p_full_cpf then substr(p.cpf,1,3)||'.'||substr(p.cpf,4,3)||'.'||substr(p.cpf,7,3)||'-'||substr(p.cpf,10,2) else '***.***.***-'||right(p.cpf,2) end,'hasCpf',p.cpf<>'','sector',p.sector,'email',p.email,'confirmed',p.confirmed,'confirmed_at',p.confirmed_at,'origin',p.origin,'created_at',p.created_at,'revision',p.revision) order by p.created_at,p.id),'[]') into people from implanta_private.attendance_people p where list_id=p_id;
 if p_full_cpf then insert into implanta_private.attendance_audit(list_id,actor_id,action) values(p_id,auth.uid(),'full_cpf_report'); end if;
 select coalesce(jsonb_agg(x),'[]') into history from (select a.action,a.at,a.actor_id,a.actor_name,a.participant_id,p.name as participant_name from implanta_private.attendance_audit a left join implanta_private.attendance_people p on p.id=a.participant_id and p.list_id=a.list_id where a.list_id=p_id order by a.id desc limit 100) x;
 return jsonb_build_object('list',to_jsonb(l)-'token_hash','people',people,'audit',history);
end $$;
create or replace function public.implanta_attendance_link(p_id uuid,p_action text,p_expires timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists; token text;
begin
 select * into l from implanta_private.attendance_lists where id=p_id;
 perform implanta_private.attendance_edit(l.project_id);
 perform 1 from implanta_private.attendance_lists where id=p_id for update;
 if p_action='generate' then
  if p_expires is null or p_expires<=now() or p_expires>now()+interval '90 days' then raise exception 'Escolha uma validade futura de até 90 dias.' using errcode='23514'; end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  update implanta_private.attendance_lists set token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),expires_at=p_expires,signup_open=true,revision=revision+1,updated_at=now() where id=p_id;
 elsif p_action='close' then
  update implanta_private.attendance_lists set token_hash=null,signup_open=false,revision=revision+1,updated_at=now() where id=p_id;
 else raise exception 'Ação inválida.'; end if;
 insert into implanta_private.attendance_audit(list_id,actor_id,action) values(p_id,auth.uid(),'link_'||p_action);
 return jsonb_build_object('token',token);
end $$;
create or replace function public.implanta_attendance_person_save(p_list uuid,p_id uuid,p_revision integer,p_data jsonb,p_clear_cpf boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists; d jsonb; old implanta_private.attendance_people; accepted boolean:=coalesce((p_data->>'confirmed')::boolean,false);
begin
 select * into l from implanta_private.attendance_lists where id=p_list;
 perform implanta_private.attendance_edit(l.project_id);
 perform 1 from implanta_private.attendance_lists where id=p_list for update;
 d:=implanta_private.attendance_person(p_data);
 if p_revision=0 then
  if (select count(*) from implanta_private.attendance_people where list_id=p_list)>=1000 then raise exception 'Limite de 1.000 participantes por lista atingido.'; end if;
  insert into implanta_private.attendance_people(id,list_id,name,cpf,sector,email,confirmed,confirmed_at,origin,created_by) values(p_id,p_list,d->>'name',d->>'cpf',d->>'sector',d->>'email',accepted,case when accepted then now() end,'manual',auth.uid());
 else
  select * into old from implanta_private.attendance_people where id=p_id and list_id=p_list for update;
  if old.id is null or old.revision<>p_revision then raise exception 'Este participante foi alterado. Recarregue antes de salvar.' using errcode='40001'; end if;
  update implanta_private.attendance_people set name=d->>'name',cpf=case when p_clear_cpf then '' when d->>'cpf'='' then old.cpf else d->>'cpf' end,sector=d->>'sector',email=d->>'email',confirmed=accepted,confirmed_at=case when not accepted then null when old.confirmed then old.confirmed_at else now() end,revision=revision+1,updated_at=now() where id=p_id;
 end if;
 insert into implanta_private.attendance_audit(list_id,participant_id,actor_id,action) values(p_list,p_id,auth.uid(),case when p_revision=0 then 'participant_created' else 'participant_updated' end);
exception when unique_violation then raise exception 'Participante já registrado. Confira o e-mail ou atualize a lista.' using errcode='23505';
end $$;
create or replace function public.implanta_attendance_delete(p_list uuid,p_person uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists;
begin
 select * into l from implanta_private.attendance_lists where id=p_list;
 perform implanta_private.attendance_edit(l.project_id);
 perform 1 from implanta_private.attendance_lists where id=p_list for update;
 if p_person is null then
  delete from implanta_private.attendance_lists where id=p_list and revision=p_revision;
 else
  delete from implanta_private.attendance_people where id=p_person and list_id=p_list and revision=p_revision;
 end if;
 if not found then raise exception 'O registro foi alterado. Atualize a lista antes de excluir.' using errcode='40001'; end if;
 if p_person is not null then insert into implanta_private.attendance_audit(list_id,participant_id,actor_id,action) values(p_list,p_person,auth.uid(),'participant_deleted'); end if;
end $$;
create or replace function implanta_private.attendance_public_list(p_token text) returns implanta_private.attendance_lists
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists;
begin
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'Link indisponível ou encerrado.' using errcode='42501'; end if;
 select a.* into l from implanta_private.attendance_lists a where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and signup_open and expires_at>now()
 and not exists(select 1 from public.implanta_municipality_records m where m.project_id=a.project_id and m.data->>'status'='closed');
 if l.id is null then raise exception 'Link indisponível ou encerrado.' using errcode='42501'; end if;
 return l;
end $$;
create or replace function public.implanta_attendance_public_read(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists;
begin
 l:=implanta_private.attendance_public_list(p_token);
 return l.data-'trainingId';
end $$;
create or replace function public.implanta_attendance_register(p_token text,p_request uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists; d jsonb;
begin
 l:=implanta_private.attendance_public_list(p_token);
 perform 1 from public.implanta_projects where id=l.project_id for share;
 perform 1 from implanta_private.attendance_lists where id=l.id for update;
 l:=implanta_private.attendance_public_list(p_token); -- recheck closing/rotation after waiting
 if p_data->>'confirmed' is distinct from 'true' then raise exception 'Confirme sua participação antes de enviar.' using errcode='23514'; end if;
 d:=implanta_private.attendance_person(p_data);
 -- Retry of a successfully sent form is harmless; do not return stored personal data.
 if exists(select 1 from implanta_private.attendance_people where id=p_request and list_id=l.id) then return jsonb_build_object('registered',true); end if;
 if (select count(*) from implanta_private.attendance_people where list_id=l.id)>=1000 then raise exception 'Inscrições encerradas. Procure o instrutor.'; end if;
 insert into implanta_private.attendance_people(id,list_id,name,cpf,sector,email,confirmed,confirmed_at,origin) values(p_request,l.id,d->>'name',d->>'cpf',d->>'sector',d->>'email',true,now(),'public') on conflict do nothing;
 if found then insert into implanta_private.attendance_audit(list_id,participant_id,action) values(l.id,p_request,'participant_self_registered'); end if;
 return jsonb_build_object('registered',true);
end $$;
revoke all on function implanta_private.attendance_audit_stamp() from public,anon,authenticated;
revoke all on function implanta_private.attendance_edit(text),implanta_private.attendance_person(jsonb),implanta_private.attendance_public_list(text) from public,anon,authenticated;
revoke all on function public.implanta_attendance_lists(text),public.implanta_attendance_save(text,uuid,integer,jsonb),public.implanta_attendance_read(uuid,boolean),public.implanta_attendance_link(uuid,text,timestamptz),public.implanta_attendance_person_save(uuid,uuid,integer,jsonb,boolean),public.implanta_attendance_delete(uuid,uuid,integer),public.implanta_attendance_public_read(text),public.implanta_attendance_register(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.implanta_attendance_lists(text),public.implanta_attendance_save(text,uuid,integer,jsonb),public.implanta_attendance_read(uuid,boolean),public.implanta_attendance_link(uuid,text,timestamptz),public.implanta_attendance_person_save(uuid,uuid,integer,jsonb,boolean),public.implanta_attendance_delete(uuid,uuid,integer) to authenticated;
grant execute on function public.implanta_attendance_public_read(text),public.implanta_attendance_register(text,uuid,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
