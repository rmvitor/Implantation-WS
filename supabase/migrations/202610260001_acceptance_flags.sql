-- Implanta 1.16.0: flags exclusivas e aceite do cliente dependente do técnico.
-- Requer 202610240002 (ou SQL único 202610240003) já aplicado.
-- Faça backup; execute este arquivo inteiro. Respostas, perguntas e termos são preservados.
-- Confirmações antigas incompatíveis são arquivadas em approvalHistory de cada ponto.
begin;
set local lock_timeout='15s';
lock table public.implanta_projects in access exclusive mode;
do $$ begin
 if to_regprocedure('public.implanta_implantation_templates()') is null then raise exception 'Execute primeiro o complemento 202610240002 ou o SQL único 202610240003.'; end if;
end $$;
create or replace function implanta_private.implantation_normalize_flags(q jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb:=q;
begin
 if (q->>'answer' in ('no','na') and (coalesce(q->'technical','null')<>'null'::jsonb or jsonb_array_length(coalesce(q->'clients','[]'))>0 or q->>'notUsed'='true')) or (jsonb_array_length(coalesce(q->'clients','[]'))>0 and coalesce(q->'technical','null')='null'::jsonb) then
  result:=jsonb_set(result,'{approvalHistory}',coalesce(q->'approvalHistory','[]') || jsonb_build_array(jsonb_build_object('reason','Atualização das regras de exclusividade 1.16.0','at',now(),'answer',q->'answer','technical',q->'technical','clients',q->'clients','notUsed',q->'notUsed')));
  if q->>'answer' in ('no','na') then result:=result || jsonb_build_object('technical',null,'notUsed',false); end if;
  result:=result || jsonb_build_object('clients','[]'::jsonb);
 end if;
 return result;
end $$;
revoke all on function implanta_private.implantation_normalize_flags(jsonb) from public,anon,authenticated;
do $$
declare p record; updated_value jsonb; changed_projects text[]:='{}'; original_subject text:=current_setting('request.jwt.claim.sub',true); master_id uuid; log_value jsonb;
begin
 select a.user_id into master_id from implanta_private.admins a join public.implanta_profiles u on u.id=a.user_id where u.active limit 1;
 if master_id is null then raise exception 'É necessário um Master ativo para preservar as permissões na atualização.'; end if;
 perform set_config('request.jwt.claim.sub',master_id::text,true);
 if to_regclass('implanta_private.record_tables') is not null then
  lock table public.implanta_implantation_question_records in access exclusive mode;
  for p in update public.implanta_implantation_question_records set data=jsonb_set(data,'{question}',implanta_private.implantation_normalize_flags(data->'question')),revision=revision+1,updated_at=now(),updated_by=null where data->'question' is distinct from implanta_private.implantation_normalize_flags(data->'question') returning project_id,id loop
   if not p.project_id=any(changed_projects) then changed_projects:=array_append(changed_projects,p.project_id); end if;
   insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_name,changed_fields) values(p.project_id,'implantation_question',p.id,'migration','Atualização de regras 1.16.0',array['technical','clients','approvalHistory']);
  end loop;
  update public.implanta_projects set version=version+1,updated_at=now(),updated_by=null where id=any(changed_projects);
 else
  for p in select id,data from public.implanta_projects where data ? 'implantation' loop
   select jsonb_set(p.data,'{implantation,entries}',coalesce(jsonb_agg(jsonb_set(e,'{questions}',coalesce((select jsonb_agg(implanta_private.implantation_normalize_flags(q) order by n) from jsonb_array_elements(e->'questions') with ordinality x(q,n)),'[]')) order by i),'[]')) into updated_value from jsonb_array_elements(p.data->'implantation'->'entries') with ordinality x(e,i);
   if updated_value is distinct from p.data then
    log_value:=jsonb_build_object('id',gen_random_uuid()::text,'title','Implantação · Atualização de regras','action','confirmações anteriores preservadas em cada ponto; flags incompatíveis removidas','at',now(),'actorName','Atualização de regras 1.16.0');
    updated_value:=jsonb_set(updated_value,'{logs}',jsonb_build_array(log_value)||coalesce(updated_value->'logs','[]'));
    update public.implanta_projects set data=updated_value,version=version+1,updated_at=now(),updated_by=null where id=p.id;
   end if;
  end loop;
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(original_subject,''),true);
end $$;
create or replace function implanta_private.implantation_stamp_question_v2(value jsonb, previous jsonb) returns jsonb
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

-- Enforce the same exclusivity used by the UI on every authenticated write.
create or replace function implanta_private.implantation_stamp_question(value jsonb,previous jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; blank_reset boolean;
begin
 if value->>'answer' in ('no','na') and (coalesce(value->'technical','null')<>'null'::jsonb or jsonb_array_length(coalesce(value->'clients','[]'))>0) then raise exception 'Não e Não se aplica não podem ter aceites.' using errcode='23514'; end if;
 if jsonb_array_length(coalesce(value->'clients','[]'))>0 and coalesce(value->'technical','null')='null'::jsonb then raise exception 'Registre primeiro o aceite do técnico.' using errcode='23514'; end if;
 result:=implanta_private.implantation_stamp_question_v2(value,previous);
 blank_reset:=value->>'answer'='' and value->>'notes'='' and coalesce(value->'technical','null')='null'::jsonb and jsonb_array_length(coalesce(value->'clients','[]'))=0 and jsonb_array_length(coalesce(value->'responsibleIds','[]'))=0;
 if exists(select 1 from jsonb_array_elements(coalesce(previous->'clients','[]')) c where c->>'source'='server') and result->'technical' is distinct from previous->'technical' and not blank_reset and not (implanta_private.admin() and coalesce(value->'technical'->>'source','')='imported-unverified') then raise exception 'Remova primeiro o aceite do cliente antes de alterar o técnico ou a resposta.' using errcode='23514'; end if;
 if jsonb_array_length(coalesce(result->'clients','[]'))>0 and coalesce(result->'technical','null')='null'::jsonb then raise exception 'O cliente exige aceite técnico válido.' using errcode='23514'; end if;
 return result;
end $$;
revoke all on function implanta_private.implantation_stamp_question_v2(jsonb,jsonb) from public,anon,authenticated;
create or replace function implanta_private.implantation_ready(value jsonb,entity text,entities jsonb,module text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and entities ? entity and (module='' or e->>'module'=module))
 and not exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and (module='' or e->>'module'=module) and (
 jsonb_array_length(e->'questions')=0 or exists(select 1 from jsonb_array_elements(e->'questions') q where
 coalesce(q->>'answer','') not in ('yes','no','na') or ((q->>'answer'='na' or q->>'answer'=q->>'justifyWhen') and coalesce(trim(q->>'notes'),'')='') or
 (q->>'kind'='capability' and q->>'answer'='no') or (q->>'kind'='blocking' and q->>'answer'='yes') or
 (q->>'answer' in ('no','na') and (coalesce(q->'technical','null')<>'null'::jsonb or jsonb_array_length(q->'clients')>0)) or
 (q->>'answer'='yes' and (coalesce(q->'technical'->>'source','')<>'server' or jsonb_array_length(q->'responsibleIds')=0 or exists(select 1 from jsonb_array_elements_text(q->'responsibleIds') id where not exists(select 1 from jsonb_array_elements(q->'clients') c where c->>'id'=id and c->>'source'='server')))))))
$$;
create or replace function public.implanta_implantation_capabilities() returns jsonb language plpgsql security definer set search_path='' as $$
declare count_kinds integer;
begin
 if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
 if to_regclass('implanta_private.record_tables') is not null then
  select count(*) into count_kinds from implanta_private.record_tables where kind in ('implantation','implantation_module','implantation_question','implantation_term');
  if count_kinds<>4 then return jsonb_build_object('version',0); end if;
 end if;
 return jsonb_build_object('version',1,'workflowVersion',3);
end $$;
notify pgrst,'reload schema';
commit;
