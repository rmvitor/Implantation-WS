-- Implanta 1.20: ajustes de ponto pessoais, independentes dos municípios.
begin;
set local lock_timeout='15s';
create table if not exists implanta_private.time_adjustments(
 id uuid primary key, user_id uuid not null references public.implanta_profiles(id) on delete cascade,
 data jsonb not null,revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists time_adjustments_user_date on implanta_private.time_adjustments(user_id,updated_at desc);
create table if not exists implanta_private.time_adjustment_audit(
 id bigint generated always as identity primary key, record_id uuid not null,
 user_id uuid not null references public.implanta_profiles(id) on delete cascade,
 actor_name text not null,action text not null,at timestamptz not null default now()
);
alter table implanta_private.time_adjustments enable row level security;
alter table implanta_private.time_adjustment_audit enable row level security;
revoke all on implanta_private.time_adjustments,implanta_private.time_adjustment_audit from public,anon,authenticated;
create or replace function implanta_private.time_adjustment_data(p_data jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare k text; maximum integer; selected integer:=0; point jsonb; result jsonb; points jsonb:='{}';
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados do ajuste inválidos.' using errcode='23514'; end if;
 for k,maximum in select * from (values('employeeName',160),('jobTitle',160),('justification',3000),('entity',240),('contractManager',200),('place',200),('signerName',160),('signerRegistration',100)) as limits(key,maximum) loop
  if jsonb_typeof(p_data->k) is distinct from 'string' or length(p_data->>k)>maximum then raise exception 'Confira os textos do ajuste de ponto.' using errcode='23514'; end if;
 end loop;
 foreach k in array array['employeeName','jobTitle','justification','place'] loop
  if trim(p_data->>k)='' then raise exception 'Informe nome, cargo, justificativa e local.' using errcode='23514'; end if;
 end loop;
 foreach k in array array['occurrenceDate','issuedDate'] loop
  if jsonb_typeof(p_data->k) is distinct from 'string' or p_data->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida.' using errcode='23514'; end if;
  perform (p_data->>k)::date;
 end loop;
 if jsonb_typeof(p_data->'issuedTime') is distinct from 'string' or p_data->>'issuedTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Horário de emissão inválido.' using errcode='23514'; end if;
 if jsonb_typeof(p_data->'punches') is distinct from 'object' then raise exception 'Marcações inválidas.' using errcode='23514'; end if;
 if (select count(*) from jsonb_object_keys(p_data->'punches'))<>4 then raise exception 'Confira as quatro marcações.' using errcode='23514'; end if;
 foreach k in array array['entry','breakStart','breakEnd','exit'] loop
  point:=p_data->'punches'->k;
  if jsonb_typeof(point->'selected') is distinct from 'boolean' or jsonb_typeof(point->'time') is distinct from 'string' then raise exception 'Marcação inválida.' using errcode='23514'; end if;
  if point->>'selected'='true' then
   selected:=selected+1;
   if point->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Informe o horário das marcações selecionadas.' using errcode='23514'; end if;
  elsif point->>'time'<>'' then raise exception 'Horário informado em marcação não selecionada.' using errcode='23514'; end if;
  points:=points || jsonb_build_object(k,jsonb_build_object('selected',(point->>'selected')::boolean,'time',point->>'time'));
 end loop;
 if selected=0 then raise exception 'Selecione pelo menos uma marcação.' using errcode='23514'; end if;
 select jsonb_object_agg(key,value) into result from jsonb_each(p_data) where key=any(array['employeeName','jobTitle','occurrenceDate','punches','justification','entity','contractManager','place','issuedDate','issuedTime','signerName','signerRegistration']);
 return result || jsonb_build_object('punches',points);
end $$;
create or replace function public.implanta_time_adjustments() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not implanta_private.enabled() then raise exception 'Entre em uma conta ativa.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by updated_at desc,id) from implanta_private.time_adjustments t where user_id=auth.uid()),'[]');
end $$;
create or replace function public.implanta_time_adjustment_save(p_id uuid,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb;r implanta_private.time_adjustments;
begin
 perform pg_advisory_xact_lock(2026100901);
 if not implanta_private.enabled() then raise exception 'Entre em uma conta ativa.' using errcode='42501'; end if;
 d:=implanta_private.time_adjustment_data(p_data);
 if p_revision=0 then
  insert into implanta_private.time_adjustments(id,user_id,data) values(p_id,auth.uid(),d) on conflict do nothing returning * into r;
 else
  update implanta_private.time_adjustments set data=d,revision=revision+1,updated_at=now() where id=p_id and user_id=auth.uid() and revision=p_revision returning * into r;
 end if;
 if r.id is null then raise exception 'O registro foi alterado ou não está disponível. Recarregue antes de salvar.' using errcode='40001'; end if;
 insert into implanta_private.time_adjustment_audit(record_id,user_id,actor_name,action) values(r.id,auth.uid(),(select display_name from public.implanta_profiles where id=auth.uid()),case when p_revision=0 then 'created' else 'updated' end);
 return to_jsonb(r);
end $$;
create or replace function public.implanta_time_adjustment_delete(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(2026100901);
 if not implanta_private.enabled() then raise exception 'Entre em uma conta ativa.' using errcode='42501'; end if;
 delete from implanta_private.time_adjustments where id=p_id and user_id=auth.uid() and revision=p_revision;
 if not found then raise exception 'O registro foi alterado ou não está disponível. Recarregue antes de excluir.' using errcode='40001'; end if;
 insert into implanta_private.time_adjustment_audit(record_id,user_id,actor_name,action) values(p_id,auth.uid(),(select display_name from public.implanta_profiles where id=auth.uid()),'deleted');
end $$;
revoke all on function implanta_private.time_adjustment_data(jsonb) from public,anon,authenticated;
revoke all on function public.implanta_time_adjustments(),public.implanta_time_adjustment_save(uuid,integer,jsonb),public.implanta_time_adjustment_delete(uuid,integer) from public,anon,authenticated;
grant execute on function public.implanta_time_adjustments(),public.implanta_time_adjustment_save(uuid,integer,jsonb),public.implanta_time_adjustment_delete(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
