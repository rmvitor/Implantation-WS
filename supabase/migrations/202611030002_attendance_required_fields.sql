-- Implanta 1.19.1 — obrigatoriedade dos campos por município.
-- Execute após 202611030001_training_attendance.sql. Não modifica presenças existentes.
begin;
set local lock_timeout='15s';
do $$ begin
 if to_regclass('implanta_private.attendance_lists') is null then raise exception 'Execute primeiro o SQL 202611030001_training_attendance.sql das listas de presença.'; end if;
end $$;
create table if not exists implanta_private.attendance_settings(
 project_id text primary key references public.implanta_projects(id) on delete cascade,
 required_fields jsonb not null,revision integer not null default 1,
 updated_by uuid references public.implanta_profiles(id) on delete set null,updated_at timestamptz not null default now()
);
create table if not exists implanta_private.attendance_settings_audit(
 id bigint generated always as identity primary key,
 project_id text not null references public.implanta_projects(id) on delete cascade,
 required_fields jsonb not null,actor_id uuid,actor_name text not null,at timestamptz not null default now()
);
alter table implanta_private.attendance_settings enable row level security;
alter table implanta_private.attendance_settings_audit enable row level security;
revoke all on implanta_private.attendance_settings,implanta_private.attendance_settings_audit from public,anon,authenticated;
create or replace function implanta_private.attendance_required(p_project text) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce((select required_fields from implanta_private.attendance_settings where project_id=p_project),'{"name":true,"cpf":true,"sector":true,"email":true}'::jsonb)
$$;
create or replace function public.implanta_attendance_settings(p_project text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s implanta_private.attendance_settings; history jsonb;
begin
 if not implanta_private.can_read(p_project) then raise exception 'Sem acesso ao projeto.' using errcode='42501'; end if;
 select * into s from implanta_private.attendance_settings where project_id=p_project;
 select coalesce(jsonb_agg(x),'[]') into history from (select actor_name,at,required_fields from implanta_private.attendance_settings_audit where project_id=p_project order by id desc limit 20)x;
 return jsonb_build_object('requiredFields',implanta_private.attendance_required(p_project),'revision',coalesce(s.revision,0),'updatedAt',s.updated_at,'audit',history);
end $$;
create or replace function public.implanta_attendance_settings_save(p_project text,p_revision integer,p_required jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text;
begin
 perform implanta_private.attendance_edit(p_project);
 if jsonb_typeof(p_required) is distinct from 'object' then raise exception 'Configuração de campos inválida.' using errcode='23514'; end if;
 if (select count(*) from jsonb_object_keys(p_required))<>4 then raise exception 'Configure os quatro campos do participante.' using errcode='23514'; end if;
 foreach k in array array['name','cpf','sector','email'] loop
  if jsonb_typeof(p_required->k) is distinct from 'boolean' then raise exception 'Configuração de campos inválida.' using errcode='23514'; end if;
 end loop;
 if p_revision=0 then
  insert into implanta_private.attendance_settings(project_id,required_fields,updated_by) values(p_project,p_required,auth.uid()) on conflict do nothing;
 else
  update implanta_private.attendance_settings set required_fields=p_required,revision=revision+1,updated_by=auth.uid(),updated_at=now() where project_id=p_project and revision=p_revision;
 end if;
 if not found then raise exception 'A configuração foi alterada por outra pessoa. Reabra a configuração antes de salvar.' using errcode='40001'; end if;
 insert into implanta_private.attendance_settings_audit(project_id,required_fields,actor_id,actor_name) values(p_project,p_required,auth.uid(),(select display_name from public.implanta_profiles where id=auth.uid()));
 return public.implanta_attendance_settings(p_project);
end $$;

-- Validate formats when present; required/optional is checked against the project policy.
create or replace function implanta_private.attendance_person(p_data jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare n text:=trim(coalesce(p_data->>'name','')); c text:=regexp_replace(coalesce(p_data->>'cpf',''),'[^0-9]','','g'); e text:=lower(trim(coalesce(p_data->>'email',''))); s text:=trim(coalesce(p_data->>'sector','')); digits integer[]; total integer; j integer; k integer;
begin
 if (n<>'' and length(n)<2) or length(n)>200 or length(s)>200 or length(e)>254 or (e<>'' and e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Confira nome, setor e e-mail do participante.' using errcode='23514'; end if;
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
create or replace function implanta_private.attendance_validate_person(p_project text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; fields jsonb; k text;
begin
 d:=implanta_private.attendance_person(p_data);
 fields:=implanta_private.attendance_required(p_project);
 foreach k in array array['name','cpf','sector','email'] loop
  if (fields->>k)::boolean and coalesce(d->>k,'')='' then
   raise exception 'Preencha o campo obrigatório: %.',case k when 'name' then 'Nome completo' when 'cpf' then 'CPF' when 'sector' then 'Setor' else 'E-mail' end using errcode='23514';
  end if;
 end loop;
 return d;
end $$;
create or replace function public.implanta_attendance_person_save(p_list uuid,p_id uuid,p_revision integer,p_data jsonb,p_clear_cpf boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists; d jsonb; old implanta_private.attendance_people; accepted boolean:=coalesce((p_data->>'confirmed')::boolean,false);
begin
 select * into l from implanta_private.attendance_lists where id=p_list;
 perform implanta_private.attendance_edit(l.project_id);
 perform 1 from implanta_private.attendance_lists where id=p_list for update;

 if p_revision=0 then
  d:=implanta_private.attendance_validate_person(l.project_id,p_data);
  if (select count(*) from implanta_private.attendance_people where list_id=p_list)>=1000 then raise exception 'Limite de 1.000 participantes por lista atingido.'; end if;
  insert into implanta_private.attendance_people(id,list_id,name,cpf,sector,email,confirmed,confirmed_at,origin,created_by) values(p_id,p_list,d->>'name',d->>'cpf',d->>'sector',d->>'email',accepted,case when accepted then now() end,'manual',auth.uid());
 else
  select * into old from implanta_private.attendance_people where id=p_id and list_id=p_list for update;
  if old.id is null or old.revision<>p_revision then raise exception 'Este participante foi alterado. Recarregue antes de salvar.' using errcode='40001'; end if;
  d:=implanta_private.attendance_validate_person(l.project_id,p_data || jsonb_build_object('cpf',case when p_clear_cpf then '' when coalesce(trim(p_data->>'cpf'),'')='' then old.cpf else p_data->>'cpf' end));
  update implanta_private.attendance_people set name=d->>'name',cpf=case when p_clear_cpf then '' when d->>'cpf'='' then old.cpf else d->>'cpf' end,sector=d->>'sector',email=d->>'email',confirmed=accepted,confirmed_at=case when not accepted then null when old.confirmed then old.confirmed_at else now() end,revision=revision+1,updated_at=now() where id=p_id;
 end if;
 insert into implanta_private.attendance_audit(list_id,participant_id,actor_id,action) values(p_list,p_id,auth.uid(),case when p_revision=0 then 'participant_created' else 'participant_updated' end);
exception when unique_violation then raise exception 'Participante já registrado. Confira o e-mail ou atualize a lista.' using errcode='23505';
end $$;
create or replace function public.implanta_attendance_public_read(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l implanta_private.attendance_lists;
begin
 l:=implanta_private.attendance_public_list(p_token);
 return (l.data-'trainingId') || jsonb_build_object('requiredFields',implanta_private.attendance_required(l.project_id));
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

 -- Retry of a successfully sent form is harmless; do not return stored personal data.
 if exists(select 1 from implanta_private.attendance_people where id=p_request and list_id=l.id) then return jsonb_build_object('registered',true); end if;
 d:=implanta_private.attendance_validate_person(l.project_id,p_data);
 if (select count(*) from implanta_private.attendance_people where list_id=l.id)>=1000 then raise exception 'Inscrições encerradas. Procure o instrutor.'; end if;
 insert into implanta_private.attendance_people(id,list_id,name,cpf,sector,email,confirmed,confirmed_at,origin) values(p_request,l.id,d->>'name',d->>'cpf',d->>'sector',d->>'email',true,now(),'public') on conflict do nothing;
 if found then insert into implanta_private.attendance_audit(list_id,participant_id,action) values(l.id,p_request,'participant_self_registered'); end if;
 return jsonb_build_object('registered',true);
end $$;
revoke all on function implanta_private.attendance_required(text),implanta_private.attendance_validate_person(text,jsonb),implanta_private.attendance_person(jsonb) from public,anon,authenticated;
revoke all on function public.implanta_attendance_settings(text),public.implanta_attendance_settings_save(text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.implanta_attendance_settings(text),public.implanta_attendance_settings_save(text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
