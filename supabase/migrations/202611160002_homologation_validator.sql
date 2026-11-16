-- Execute depois de 202611160001. Não reatribui OKs antigos.
begin;
create or replace function implanta_private.homologation_validation(p_project text,p_entry text,p_data jsonb,p_stamp text,p_author text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r implanta_private.homologation_resources; chosen uuid; person text;
begin
 perform pg_advisory_xact_lock(2026100901);
 if not implanta_private.can_edit(p_project) or exists(select 1 from public.implanta_municipality_records where project_id=p_project and data->>'status'='closed') then
  raise exception 'Sem permissão para registrar a homologação.' using errcode='42501';
 end if;
 select * into r from implanta_private.homologation_resources where project_id=p_project and kind='migration' and entry_id=p_entry for update;
 if p_data ? 'responsibleRevision' and (p_data->>'responsibleRevision')::integer is distinct from coalesce(r.revision,0) then
  raise exception 'O responsável foi alterado em outro aparelho. Atualize e confira Validado por antes de registrar o OK.' using errcode='40001';
 end if;
 chosen:=case when p_data ? 'validatedResponsibleId' then nullif(p_data->>'validatedResponsibleId','')::uuid else coalesce(r.responsible_id,auth.uid()) end;
 if p_data->>'status'='ok' and chosen is null then raise exception 'Escolha quem validou a homologação.' using errcode='23514'; end if;
 if chosen is not null and not implanta_private.homologation_user(p_project,chosen) then raise exception 'Escolha um responsável ativo com acesso ao projeto antes de registrar o OK.' using errcode='23514'; end if;
 select display_name into person from public.implanta_profiles where id=chosen;
 if r.responsible_id is distinct from chosen then
  insert into implanta_private.homologation_resources(project_id,kind,entry_id,responsible_id,responsible_name,updated_by)
   values(p_project,'migration',p_entry,chosen,coalesce(person,''),auth.uid())
   on conflict(project_id,kind,entry_id) do update set responsible_id=excluded.responsible_id,responsible_name=excluded.responsible_name,revision=homologation_resources.revision+1,updated_by=auth.uid(),updated_at=now();
  perform implanta_private.homologation_resource_log(p_project,'migration',p_entry,'responsible_changed',jsonb_build_object('id',chosen,'name',person,'source','validation'));
 end if;
 if p_data->>'status'<>'ok' then return (p_data-'responsibleRevision') || jsonb_build_object('validatedResponsibleId',chosen); end if;
 return (p_data-'responsibleRevision') || jsonb_build_object('validatedActorId',chosen,'validatedResponsibleId',chosen,'validatedBy',person,'validatedAt',p_stamp,'validationSource','server',
 'recordedActorId',auth.uid(),'recordedBy',p_author,'recordedAt',p_stamp,'recordedSource','server');
end $$;
revoke all on function implanta_private.homologation_validation(text,text,jsonb,text,text) from public,anon,authenticated;
-- Preserve the current writer, including ACLs, CAS, imports and all other routines.
-- Abort rather than replacing an unknown version of the function.
do $$
declare definition text; original text := 'payload || jsonb_build_object(''validatedActorId'',auth.uid(),''validatedBy'',author,''validatedAt'',stamp,''validationSource'',''server'')';
begin
 select pg_get_functiondef('public.implanta_commit_v2(jsonb,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure) into definition;
 if position('implanta_private.homologation_validation(' in definition)=0 then
  if position(original in definition)=0 then raise exception 'Versão do gravador não reconhecida. Nenhuma alteração foi aplicada.'; end if;
  definition:=replace(definition,original,'implanta_private.homologation_validation(project_id,record_id,payload,stamp,author)');
  definition:=replace(definition,'if kind=''conference'' and payload->>''status''=''ok'' and (old_data','if kind=''conference'' and (payload->>''status''=''ok'' or payload ? ''validatedResponsibleId'') and (old_data');
  -- Same lock order used by resource edits and permission changes.
  if position(E'begin\n  if not implanta_private.enabled()' in definition)=0 then raise exception 'Início do gravador não reconhecido.'; end if;
  definition:=replace(definition,E'begin\n  if not implanta_private.enabled()',E'begin\n  perform pg_advisory_xact_lock(2026100901);\n  if not implanta_private.enabled()');
  execute definition;
 end if;
 select pg_get_functiondef('public.implanta_homologation_resources(text,text,text)'::regprocedure) into definition;
 if position('''validatorVersion''' in definition)=0 then
  if position('jsonb_build_object(''revision'',' in definition)=0 then raise exception 'Consulta de responsáveis não reconhecida.'; end if;
  execute replace(definition,'jsonb_build_object(''revision'',','jsonb_build_object(''validatorVersion'',1,''revision'',');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
