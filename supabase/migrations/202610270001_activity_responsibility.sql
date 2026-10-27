-- Implanta 1.18.0: account-linked activity assignments. No project/history deletion.
-- Requires project roles (202610150001) and normalized records (202610240003).
begin;
set local lock_timeout='15s';
do $$ begin
 if to_regclass('public.implanta_activity_records') is null or to_regclass('implanta_private.role_settings') is null then
  raise exception 'Ative primeiro os registros separados e os níveis Master/gestor.';
 end if;
end $$;
lock table public.implanta_projects,public.implanta_profiles,public.implanta_members,public.implanta_activity_records in share row exclusive mode;

alter table public.implanta_activity_records add column if not exists created_by uuid references public.implanta_profiles(id) on delete set null;
create index if not exists implanta_activity_assignee on public.implanta_activity_records((data->>'ownerId'));

create or replace function implanta_private.activity_editor(p_project text,p_user text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.implanta_profiles p where p.id::text=p_user and p.active and (
  exists(select 1 from implanta_private.admins a where a.user_id=p.id) or
  exists(select 1 from public.implanta_projects j where j.id=p_project and j.owner_id=p.id) or
  exists(select 1 from public.implanta_members m where m.project_id=p_project and m.user_id=p.id and m.role='editor')))
$$;

-- Only verified creation events recover a creator. A later edit/import is not
-- evidence that its author created the original activity. Keep unknowns unknown.
do $$
declare r record; creator uuid; assigned text; candidate text; n integer; updated jsonb; resolution text; manager uuid;
begin
 for r in select * from public.implanta_activity_records order by project_id,id loop
  creator:=r.created_by;
  if creator is null then
   select a.actor_id into creator from public.implanta_record_audit a join public.implanta_profiles p on p.id=a.actor_id
    where a.project_id=r.project_id and a.kind='activity' and a.record_id=r.id and a.action='criado' order by a.at,a.id limit 1;
  end if;
  if creator is null then
   select h.data->>'actorId' into candidate from public.implanta_history_records h join public.implanta_profiles p on p.id::text=h.data->>'actorId'
    where h.project_id=r.project_id and h.data->>'taskId'=r.id and h.data->>'source'='server' and h.data->>'action' in ('criada','criada e concluída') order by h.data->>'at',h.id limit 1;
   creator:=candidate::uuid;
  end if;
  assigned:=r.data->>'ownerId';
  resolution:='existing';
  if not implanta_private.activity_editor(r.project_id,assigned) then
   assigned:=null;
   resolution:='manual-required';
   if coalesce(trim(r.data->>'owner'),'')<>'' then
    select count(*),min(p.id::text) into n,assigned from public.implanta_profiles p
     where implanta_private.activity_editor(r.project_id,p.id::text) and (lower(trim(p.display_name))=lower(trim(r.data->>'owner')) or lower(p.email)=lower(trim(r.data->>'owner')));
    if n<>1 then assigned:=null; else resolution:='legacy-name'; end if;
   end if;
   if assigned is null then
    if implanta_private.activity_editor(r.project_id,creator::text) then assigned:=creator::text; resolution:='creator';
    else
     select owner_id into manager from public.implanta_projects where id=r.project_id;
     if implanta_private.activity_editor(r.project_id,manager::text) then assigned:=manager::text; resolution:='project-manager'; end if;
    end if;
   end if;
  end if;
  updated:=r.data || jsonb_build_object('createdBy',creator,'ownerId',assigned);
  if assigned is distinct from r.data->>'ownerId' then
   updated:=updated || jsonb_build_object('responsibilityRecovery',jsonb_build_object('source','migration','at',now(),'resolution',resolution,'previousOwner',r.data->'owner','previousOwnerId',r.data->'ownerId'));
  end if;
  if assigned is not null then
   updated:=jsonb_set(updated,'{owner}',to_jsonb((select display_name from public.implanta_profiles where id::text=assigned)));
  end if;
  if updated is distinct from r.data or creator is distinct from r.created_by then
   update public.implanta_activity_records set data=updated,created_by=creator,revision=revision+1,updated_at=now() where project_id=r.project_id and id=r.id;
   insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_name,changed_fields)
    values(r.project_id,'activity',r.id,'vínculo do responsável revisado','Migração de responsáveis',array['ownerId','owner','createdBy','responsibilityRecovery']);
   update public.implanta_projects set version=version+1,updated_at=now() where id=r.project_id;
  end if;
 end loop;
end $$;

create or replace function public.implanta_activity_assignees(p_project text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not implanta_private.can_edit(p_project) then raise exception 'Sem edição neste projeto.' using errcode='42501'; end if;
 return jsonb_build_object('version',1,'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'email',p.email) order by p.display_name,p.email)
  from public.implanta_profiles p where implanta_private.activity_editor(p_project,p.id::text)),'[]'),
  'unresolved',(select count(*) from public.implanta_activity_records a where a.project_id=p_project and not implanta_private.activity_editor(p_project,a.data->>'ownerId')));
end $$;

create or replace function implanta_private.activity_responsibility_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare assigned text; n integer; person text; original_creator uuid; is_new boolean:=false;
begin
 -- Administrative SQL can maintain the structure, but app users cannot set
 -- this context or bypass the permission checks of the commit RPC.
 if auth.uid() is null then return new; end if;
 perform pg_advisory_xact_lock(2026100901);
 if not implanta_private.can_edit(new.project_id) then raise exception 'Seu acesso de edição foi retirado. Atualize os acessos antes de continuar.' using errcode='42501'; end if;
 if tg_op='INSERT' then
  -- UPSERT runs the INSERT trigger even for an existing activity.
  select a.created_by into original_creator from public.implanta_activity_records a where a.project_id=new.project_id and a.id=new.id;
  is_new:=not found;
  new.created_by:=case when is_new then auth.uid() else original_creator end;
 else new.created_by:=old.created_by;
 end if;
 assigned:=nullif(new.data->>'ownerId','');
 if assigned is null then
  if coalesce(trim(new.data->>'owner'),'')='' then assigned:=new.created_by::text;
  else
   select count(*),min(p.id::text) into n,assigned from public.implanta_profiles p
    where implanta_private.activity_editor(new.project_id,p.id::text) and (lower(trim(p.display_name))=lower(trim(new.data->>'owner')) or lower(p.email)=lower(trim(new.data->>'owner')));
   if n<>1 then
    assigned:=null;
    if is_new then
     assigned:=new.created_by::text;
     new.data:=new.data || jsonb_build_object('responsibilityRecovery',jsonb_build_object('source','server-default','at',now(),'resolution','creator','previousOwner',new.data->'owner','previousOwnerId',new.data->'ownerId'));
    end if;
   end if;
  end if;
 end if;
 if not implanta_private.activity_editor(new.project_id,assigned) then
  raise exception 'Selecione um responsável ativo com permissão de edição neste projeto. Atualize o aplicativo e revise a atividade.' using errcode='23514';
 end if;
 select display_name into person from public.implanta_profiles where id::text=assigned;
 new.data:=new.data || jsonb_build_object('ownerId',assigned,'owner',person,'createdBy',new.created_by);
 return new;
end $$;
drop trigger if exists activity_responsibility_guard on public.implanta_activity_records;
create trigger activity_responsibility_guard before insert or update on public.implanta_activity_records
 for each row execute function implanta_private.activity_responsibility_guard();

-- Removing edit access must not leave assigned work pointing at an ineligible
-- account. Reassign first; the access operation then succeeds normally.
create or replace function implanta_private.activity_access_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare project text; target text;
begin
 perform pg_advisory_xact_lock(2026100901);
 if tg_table_name='implanta_members' then
  project:=old.project_id;target:=old.user_id::text;
 elsif tg_table_name='implanta_projects' then
  project:=new.id;target:=old.owner_id::text;
 else target:=old.id::text;
 end if;
 if project is not null and not exists(select 1 from public.implanta_projects where id=project) then return old; end if;
 if exists(select 1 from public.implanta_activity_records a where (project is null or a.project_id=project) and a.data->>'ownerId'=target and
  (tg_op='DELETE' and tg_table_name='implanta_profiles' or not implanta_private.activity_editor(a.project_id,target))) then
  raise exception 'Transfira as atividades deste responsável para outro usuário com edição antes de retirar seu acesso.' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists activity_member_access_guard on public.implanta_members;
create trigger activity_member_access_guard after update or delete on public.implanta_members
 for each row execute function implanta_private.activity_access_guard();
drop trigger if exists activity_profile_access_guard on public.implanta_profiles;
create trigger activity_profile_access_guard after update of active on public.implanta_profiles
 for each row when(old.active is distinct from new.active) execute function implanta_private.activity_access_guard();
drop trigger if exists activity_profile_delete_guard on public.implanta_profiles;
create trigger activity_profile_delete_guard before delete on public.implanta_profiles
 for each row execute function implanta_private.activity_access_guard();
drop trigger if exists activity_owner_access_guard on public.implanta_projects;
create trigger activity_owner_access_guard after update of owner_id on public.implanta_projects
 for each row when(old.owner_id is distinct from new.owner_id) execute function implanta_private.activity_access_guard();

revoke all on function implanta_private.activity_editor(text,text),implanta_private.activity_responsibility_guard(),implanta_private.activity_access_guard() from public,anon,authenticated;
revoke all on function public.implanta_activity_assignees(text) from public,anon;
grant execute on function public.implanta_activity_assignees(text) to authenticated;
notify pgrst,'reload schema';
commit;
