-- Responsável e anexos separados dos OKs. Aditivo; requer registros separados e aceites.
begin;
set local lock_timeout='15s';
create table if not exists implanta_private.homologation_resources (
 project_id text not null references public.implanta_projects(id) on delete cascade,
 kind text not null check(kind in ('migration','implantation')), entry_id text not null,
 responsible_id uuid references public.implanta_profiles(id) on delete set null,
 responsible_name text not null default '', revision integer not null default 1,
 updated_by uuid references public.implanta_profiles(id) on delete set null, updated_at timestamptz not null default now(),
 primary key(project_id,kind,entry_id)
);
create table if not exists implanta_private.homologation_files (
 id uuid primary key, project_id text not null references public.implanta_projects(id) on delete cascade,
 kind text not null check(kind in ('migration','implantation')), entry_id text not null,
 file_name text not null check(length(file_name) between 1 and 255), file_size bigint not null check(file_size between 1 and 15728640),
 state text not null default 'pending' check(state in ('pending','ready','deleting')),
 uploaded_by uuid references public.implanta_profiles(id) on delete set null,
 uploaded_name text not null, created_at timestamptz not null default now(), confirmed_at timestamptz
);
create index if not exists homologation_files_scope on implanta_private.homologation_files(project_id,kind,entry_id);
create table if not exists implanta_private.homologation_resource_audit (
 id bigint generated always as identity primary key,
 project_id text not null references public.implanta_projects(id) on delete cascade,
 kind text not null, entry_id text not null, action text not null, detail jsonb not null,
 actor_id uuid, actor_name text not null, at timestamptz not null default now()
);
alter table implanta_private.homologation_resources enable row level security;
alter table implanta_private.homologation_files enable row level security;
alter table implanta_private.homologation_resource_audit enable row level security;
revoke all on implanta_private.homologation_resources,implanta_private.homologation_files,implanta_private.homologation_resource_audit from public,anon,authenticated;

create or replace function implanta_private.homologation_scope(p_project text,p_kind text,p_entry text,p_edit boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not implanta_private.can_read(p_project) then raise exception 'Sem acesso a esta homologação.' using errcode='42501'; end if;
 if p_edit then
  perform pg_advisory_xact_lock(2026100901);
  if not implanta_private.can_edit(p_project) or exists(select 1 from public.implanta_municipality_records where project_id=p_project and data->>'status'='closed') then raise exception 'Sem permissão para alterar esta homologação.' using errcode='42501'; end if;
 end if;
 if not ((p_kind='migration' and exists(select 1 from public.implanta_conference_records where project_id=p_project and id=p_entry)) or
 (p_kind='implantation' and exists(select 1 from public.implanta_implantation_module_records where project_id=p_project and id=p_entry))) then
  raise exception 'Módulo ou entidade indisponível nesta homologação.' using errcode='42501';
 end if;
end $$;
create or replace function implanta_private.homologation_user(p_project text,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.implanta_profiles p where p.id=p_user and p.active and (
 exists(select 1 from implanta_private.admins a where a.user_id=p.id) or
 exists(select 1 from public.implanta_projects j where j.id=p_project and j.owner_id=p.id) or
 exists(select 1 from public.implanta_members m where m.project_id=p_project and m.user_id=p.id)))
$$;
create or replace function implanta_private.homologation_resource_log(p_project text,p_kind text,p_entry text,p_action text,p_detail jsonb) returns void
language sql security definer set search_path='' as $$
 insert into implanta_private.homologation_resource_audit(project_id,kind,entry_id,action,detail,actor_id,actor_name)
 values(p_project,p_kind,p_entry,p_action,p_detail,auth.uid(),coalesce((select display_name from public.implanta_profiles where id=auth.uid()),'Usuário'))
$$;
create or replace function public.implanta_homologation_resources(p_project text,p_kind text,p_entry text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r implanta_private.homologation_resources;
begin
 perform implanta_private.homologation_scope(p_project,p_kind,p_entry);
 select * into r from implanta_private.homologation_resources where project_id=p_project and kind=p_kind and entry_id=p_entry;
 return jsonb_build_object('revision',coalesce(r.revision,0),'responsibleId',r.responsible_id,'responsibleName',coalesce(r.responsible_name,''),
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name,p.id) from public.implanta_profiles p where implanta_private.homologation_user(p_project,p.id)),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(f) order by created_at,id) from implanta_private.homologation_files f where project_id=p_project and kind=p_kind and entry_id=p_entry and (state='ready' or implanta_private.can_edit(p_project))),'[]'),
 'audit',coalesce((select jsonb_agg(a) from (select action,detail,actor_name,at from implanta_private.homologation_resource_audit where project_id=p_project and kind=p_kind and entry_id=p_entry order by id desc limit 20) a),'[]'));
end $$;
create or replace function public.implanta_homologation_responsible(p_project text,p_kind text,p_entry text,p_user uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r implanta_private.homologation_resources; n text;
begin
 perform implanta_private.homologation_scope(p_project,p_kind,p_entry,true);
 if p_user is not null and not implanta_private.homologation_user(p_project,p_user) then raise exception 'Escolha um usuário ativo com acesso ao projeto.' using errcode='23514'; end if;
 select display_name into n from public.implanta_profiles where id=p_user;
 if p_revision=0 then
  insert into implanta_private.homologation_resources(project_id,kind,entry_id,responsible_id,responsible_name,updated_by)
  values(p_project,p_kind,p_entry,p_user,coalesce(n,''),auth.uid()) on conflict do nothing returning * into r;
 else
  update implanta_private.homologation_resources set responsible_id=p_user,responsible_name=coalesce(n,''),revision=revision+1,updated_by=auth.uid(),updated_at=now()
   where project_id=p_project and kind=p_kind and entry_id=p_entry and revision=p_revision returning * into r;
 end if;
 if r.project_id is null then raise exception 'O responsável foi alterado em outro aparelho. Atualize antes de salvar.' using errcode='40001'; end if;
 perform implanta_private.homologation_resource_log(p_project,p_kind,p_entry,'responsible_changed',jsonb_build_object('id',p_user,'name',coalesce(n,'')));
 return public.implanta_homologation_resources(p_project,p_kind,p_entry);
end $$;
create or replace function public.implanta_homologation_file_reserve(p_project text,p_kind text,p_entry text,p_id uuid,p_name text,p_size bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform implanta_private.homologation_scope(p_project,p_kind,p_entry,true);
 if coalesce(length(trim(p_name)),0) not between 1 and 255 or p_size is null or p_size not between 1 and 15728640 then raise exception 'Selecione um arquivo de até 15 MB, não vazio.' using errcode='23514'; end if;
 insert into implanta_private.homologation_files(id,project_id,kind,entry_id,file_name,file_size,uploaded_by,uploaded_name)
 values(p_id,p_project,p_kind,p_entry,trim(p_name),p_size,auth.uid(),coalesce((select display_name from public.implanta_profiles where id=auth.uid()),'Usuário'));
end $$;
-- Storage calls this under the user's JWT. Never allow replacement of a file.
create or replace function public.implanta_homologation_file_access(p_name text,p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare f implanta_private.homologation_files;
begin
 select * into f from implanta_private.homologation_files where id::text=p_name;
 if f.id is null then return false; end if;
 if p_write then
  return implanta_private.can_edit(f.project_id) and not exists(select 1 from public.implanta_municipality_records where project_id=f.project_id and data->>'status'='closed');
 end if;
 return implanta_private.can_read(f.project_id) and (f.state='ready' or implanta_private.can_edit(f.project_id));
end $$;
create or replace function public.implanta_homologation_pending_files(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from implanta_private.homologation_files where id::text=p_name and state='pending' and uploaded_by=auth.uid())
$$;
create or replace function public.implanta_homologation_file_finish(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f implanta_private.homologation_files; actual bigint;
begin
 select * into f from implanta_private.homologation_files where id=p_id;
 perform implanta_private.homologation_scope(f.project_id,f.kind,f.entry_id,true);
 select * into f from implanta_private.homologation_files where id=p_id for update;
 if f.id is null or f.state='deleting' then raise exception 'O anexo está em exclusão. Atualize a homologação.' using errcode='40001'; end if;
 select (metadata->>'size')::bigint into actual from storage.objects where bucket_id='homologation-attachments' and name=p_id::text;
 if actual is null or actual<>f.file_size or actual not between 1 and 15728640 then raise exception 'O arquivo não foi recebido integralmente. Remova o envio pendente e tente novamente.' using errcode='23514'; end if;
 if f.state<>'ready' then
  update implanta_private.homologation_files set state='ready',confirmed_at=now() where id=p_id;
  perform implanta_private.homologation_resource_log(f.project_id,f.kind,f.entry_id,'file_added',jsonb_build_object('id',f.id,'name',f.file_name,'size',actual));
 end if;
 return public.implanta_homologation_resources(f.project_id,f.kind,f.entry_id);
end $$;
create or replace function public.implanta_homologation_file_delete_begin(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f implanta_private.homologation_files;
begin
 select * into f from implanta_private.homologation_files where id=p_id;
 perform implanta_private.homologation_scope(f.project_id,f.kind,f.entry_id,true);
 update implanta_private.homologation_files set state='deleting' where id=p_id;
 return public.implanta_homologation_resources(f.project_id,f.kind,f.entry_id);
end $$;
create or replace function public.implanta_homologation_deleting_file(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from implanta_private.homologation_files where id::text=p_name and state='deleting')
$$;
create or replace function public.implanta_homologation_file_forget(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f implanta_private.homologation_files;
begin
 select * into f from implanta_private.homologation_files where id=p_id;
 perform implanta_private.homologation_scope(f.project_id,f.kind,f.entry_id,true);
 select * into f from implanta_private.homologation_files where id=p_id for update;
 if f.id is null then raise exception 'O anexo já foi excluído. Atualize a homologação.' using errcode='40001'; end if;
 if exists(select 1 from storage.objects where bucket_id='homologation-attachments' and name=p_id::text) then raise exception 'Remova o arquivo do armazenamento antes de concluir a exclusão.' using errcode='23514'; end if;
 delete from implanta_private.homologation_files where id=p_id;
 perform implanta_private.homologation_resource_log(f.project_id,f.kind,f.entry_id,'file_removed',jsonb_build_object('id',f.id,'name',f.file_name));
 return public.implanta_homologation_resources(f.project_id,f.kind,f.entry_id);
end $$;
revoke all on function implanta_private.homologation_scope(text,text,text,boolean),implanta_private.homologation_user(text,uuid),implanta_private.homologation_resource_log(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.implanta_homologation_resources(text,text,text),public.implanta_homologation_responsible(text,text,text,uuid,integer),public.implanta_homologation_file_reserve(text,text,text,uuid,text,bigint),public.implanta_homologation_file_access(text,boolean),public.implanta_homologation_file_finish(uuid),public.implanta_homologation_file_forget(uuid),public.implanta_homologation_pending_files(text),public.implanta_homologation_file_delete_begin(uuid),public.implanta_homologation_deleting_file(text) from public,anon,authenticated;
grant execute on function public.implanta_homologation_resources(text,text,text),public.implanta_homologation_responsible(text,text,text,uuid,integer),public.implanta_homologation_file_reserve(text,text,text,uuid,text,bigint),public.implanta_homologation_file_access(text,boolean),public.implanta_homologation_file_finish(uuid),public.implanta_homologation_file_forget(uuid),public.implanta_homologation_pending_files(text),public.implanta_homologation_file_delete_begin(uuid),public.implanta_homologation_deleting_file(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('homologation-attachments','homologation-attachments',false,15728640)
on conflict(id) do update set public=false,file_size_limit=15728640;
drop policy if exists implanta_homologation_files_read on storage.objects;
create policy implanta_homologation_files_read on storage.objects for select to authenticated using(bucket_id='homologation-attachments' and public.implanta_homologation_file_access(name));
drop policy if exists implanta_homologation_files_insert on storage.objects;
create policy implanta_homologation_files_insert on storage.objects for insert to authenticated with check(bucket_id='homologation-attachments' and public.implanta_homologation_file_access(name,true) and public.implanta_homologation_pending_files(name));
drop policy if exists implanta_homologation_files_delete on storage.objects;
create policy implanta_homologation_files_delete on storage.objects for delete to authenticated using(bucket_id='homologation-attachments' and public.implanta_homologation_file_access(name,true) and public.implanta_homologation_deleting_file(name));
notify pgrst,'reload schema';
commit;
