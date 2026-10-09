begin;

create schema if not exists implanta_private;
revoke all on schema implanta_private from public, anon;
grant usage on schema implanta_private to authenticated;

create table public.implanta_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table implanta_private.admins (
  user_id uuid primary key references public.implanta_profiles(id) on delete cascade
);
create table public.implanta_projects (
  id text primary key,
  data jsonb not null,
  version bigint not null default 1,
  created_by uuid references public.implanta_profiles(id) on delete set null,
  updated_by uuid references public.implanta_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.implanta_members (
  project_id text references public.implanta_projects(id) on delete cascade,
  user_id uuid references public.implanta_profiles(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  primary key (project_id, user_id)
);
create index implanta_members_by_user on public.implanta_members(user_id);
create table public.implanta_preferences (
  user_id uuid primary key references public.implanta_profiles(id) on delete cascade,
  data jsonb not null default '{}'
);
create table public.implanta_notifications (
  user_id uuid primary key references public.implanta_profiles(id) on delete cascade,
  revision bigint not null default 1
);
create table public.implanta_audit (
  id bigint generated always as identity primary key,
  project_id text not null,
  project_name text not null,
  actor_id uuid references public.implanta_profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  version bigint not null,
  at timestamptz not null default now()
);

create function implanta_private.enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.implanta_profiles where id = auth.uid() and active)
$$;
create function implanta_private.admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select implanta_private.enabled() and exists(select 1 from implanta_private.admins where user_id = auth.uid())
$$;
create function implanta_private.can_read(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select implanta_private.enabled() and (implanta_private.admin() or exists(
    select 1 from public.implanta_members where project_id = p_id and user_id = auth.uid()
  ))
$$;
create function implanta_private.can_edit(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select implanta_private.enabled() and (implanta_private.admin() or exists(
    select 1 from public.implanta_members where project_id = p_id and user_id = auth.uid() and role = 'editor'
  ))
$$;
create function implanta_private.notify(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.implanta_notifications(user_id) select p_user where exists(select 1 from public.implanta_profiles where id = p_user)
  on conflict (user_id) do update set revision = public.implanta_notifications.revision + 1
$$;
create function implanta_private.profile_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform implanta_private.notify(new.id);
  return new;
end $$;
create trigger implanta_profile_notification after insert or update on public.implanta_profiles
for each row execute function implanta_private.profile_changed();
create function implanta_private.new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.implanta_profiles(id, email, display_name)
  values(new.id, coalesce(new.email, ''), coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Usuário'));
  return new;
end $$;
create trigger implanta_auth_user after insert on auth.users
for each row execute function implanta_private.new_user();
-- Also support accounts registered before this migration was applied.
insert into public.implanta_profiles(id, email, display_name)
select id, coalesce(email, ''), coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), split_part(email, '@', 1), 'Usuário') from auth.users;

create function implanta_private.member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform implanta_private.notify(old.user_id);
    return old;
  end if;
  perform implanta_private.notify(new.user_id);
  return new;
end $$;
create trigger implanta_member_notification after insert or update or delete on public.implanta_members
for each row execute function implanta_private.member_changed();
create function implanta_private.project_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p_id text; p_data jsonb; p_version bigint; u uuid;
begin
  p_id := case when tg_op = 'DELETE' then old.id else new.id end;
  p_data := case when tg_op = 'DELETE' then old.data else new.data end;
  p_version := case when tg_op = 'DELETE' then old.version else new.version end;
  for u in select user_id from public.implanta_members where project_id = p_id
    union select user_id from implanta_private.admins
  loop perform implanta_private.notify(u); end loop;
  insert into public.implanta_audit(project_id, project_name, actor_id, actor_name, action, version)
    values(p_id, p_data->>'name', auth.uid(), coalesce((select display_name from public.implanta_profiles where id = auth.uid()), 'Sistema'), lower(tg_op), p_version);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger implanta_project_notification before insert or update or delete on public.implanta_projects
for each row execute function implanta_private.project_changed();

alter table public.implanta_profiles enable row level security;
alter table public.implanta_projects enable row level security;
alter table public.implanta_members enable row level security;
alter table public.implanta_preferences enable row level security;
alter table public.implanta_notifications enable row level security;
alter table public.implanta_audit enable row level security;
alter table implanta_private.admins enable row level security;
create policy implanta_profiles_read on public.implanta_profiles for select to authenticated using (id = auth.uid() or implanta_private.admin());
create policy implanta_projects_read on public.implanta_projects for select to authenticated using (implanta_private.can_read(id));
create policy implanta_members_read on public.implanta_members for select to authenticated using ((user_id = auth.uid() and implanta_private.enabled()) or implanta_private.admin());
create policy implanta_preferences_read on public.implanta_preferences for select to authenticated using (user_id = auth.uid() and implanta_private.enabled());
create policy implanta_notification_read on public.implanta_notifications for select to authenticated using (user_id = auth.uid());
create policy implanta_audit_read on public.implanta_audit for select to authenticated using (implanta_private.can_read(project_id));
revoke all on public.implanta_profiles, public.implanta_projects, public.implanta_members, public.implanta_preferences, public.implanta_notifications, public.implanta_audit from anon, authenticated;
grant select on public.implanta_profiles, public.implanta_projects, public.implanta_members, public.implanta_preferences, public.implanta_notifications, public.implanta_audit to authenticated;
-- Every write uses a guarded RPC; clients cannot bypass version checks or grant themselves access.

create function public.implanta_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'email', email, 'name', display_name, 'active', active, 'admin', implanta_private.admin())
  from public.implanta_profiles where id = auth.uid()
$$;
create function public.implanta_admin_users() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not implanta_private.admin() then raise exception 'Acesso administrativo necessário.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'name', p.display_name, 'active', p.active,
    'admin', exists(select 1 from implanta_private.admins a where a.user_id = p.id)) order by p.display_name), '[]') from public.implanta_profiles p);
end $$;
create function public.implanta_set_user(p_user uuid, p_name text, p_active boolean, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(2026100901);
  if not implanta_private.admin() then raise exception 'Acesso administrativo necessário.' using errcode = '42501'; end if;
  if p_user = auth.uid() and (not p_active or not p_admin) then raise exception 'Você não pode retirar seu próprio acesso administrativo.'; end if;
  if p_admin and not p_active then raise exception 'Administradores precisam de acesso ativo.'; end if;
  if p_active is null or p_admin is null or coalesce(trim(p_name), '') = '' then raise exception 'Informe nome e situação do usuário.'; end if;
  update public.implanta_profiles set display_name = trim(p_name), active = p_active where id = p_user;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if p_admin then insert into implanta_private.admins values(p_user) on conflict do nothing;
  else delete from implanta_private.admins where user_id = p_user; end if;
  perform implanta_private.notify(p_user);
end $$;
create function public.implanta_grant_project(p_project text, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not implanta_private.admin() then raise exception 'Acesso administrativo necessário.' using errcode = '42501'; end if;
  if not exists(select 1 from public.implanta_projects where id = p_project) then raise exception 'Projeto não encontrado.'; end if;
  if p_role is null then delete from public.implanta_members where project_id = p_project and user_id = p_user;
  elsif p_role in ('editor', 'viewer') then
    insert into public.implanta_members values(p_project, p_user, p_role)
    on conflict (project_id, user_id) do update set role = excluded.role;
  else raise exception 'Permissão inválida.'; end if;
end $$;
create function implanta_private.check_project(p_data jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'id') is distinct from 'string'
    or jsonb_typeof(p_data->'name') is distinct from 'string' or coalesce(trim(p_data->>'id'), '') = '' or coalesce(trim(p_data->>'name'), '') = ''
    or jsonb_typeof(p_data->'entities') is distinct from 'array' or jsonb_typeof(p_data->'tasks') is distinct from 'array'
    or jsonb_typeof(p_data->'trainings') is distinct from 'array' or jsonb_typeof(p_data->'logs') is distinct from 'array'
    or coalesce(p_data->>'status', 'active') not in ('active', 'closed') or octet_length(p_data::text) > 4194304
  then raise exception 'Dados do projeto inválidos ou maiores que 4 MB.'; end if;
end $$;
create function public.implanta_create_project(p_data jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if not implanta_private.admin() then raise exception 'Somente administradores podem criar projetos.' using errcode = '42501'; end if;
  perform implanta_private.check_project(p_data);
  insert into public.implanta_projects(id, data, created_by, updated_by) values(p_data->>'id', p_data, auth.uid(), auth.uid());
  return 1;
end $$;
create function public.implanta_save_project(p_id text, p_data jsonb, p_version bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare current_row public.implanta_projects; next_version bigint;
begin
  if not implanta_private.can_edit(p_id) then raise exception 'Você não tem permissão para editar este projeto.' using errcode = '42501'; end if;
  perform implanta_private.check_project(p_data);
  if p_data->>'id' is distinct from p_id then raise exception 'Identificação do projeto inválida.'; end if;
  select * into current_row from public.implanta_projects where id = p_id for update;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if current_row.version is distinct from p_version then raise exception 'O projeto foi atualizado por outro colega.' using errcode = '40001'; end if;
  if not implanta_private.admin() and (coalesce(p_data->>'status','active') is distinct from coalesce(current_row.data->>'status','active')
    or (p_data->'closedAt') is distinct from (current_row.data->'closedAt')) then raise exception 'Somente administradores podem encerrar ou reabrir projetos.' using errcode = '42501'; end if;
  update public.implanta_projects set data = p_data, version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_id returning version into next_version;
  return next_version;
end $$;
create function public.implanta_delete_project(p_id text, p_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not implanta_private.admin() then raise exception 'Somente administradores podem excluir projetos.' using errcode = '42501'; end if;
  delete from public.implanta_projects where id = p_id and version = p_version;
  if not found then raise exception 'O projeto foi alterado ou removido por outro colega.' using errcode = '40001'; end if;
end $$;
create function public.implanta_save_preferences(p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso ainda não foi liberado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or p_data ? 'projects' or octet_length(p_data::text) > 262144 then raise exception 'Preferências inválidas.'; end if;
  insert into public.implanta_preferences values(auth.uid(), p_data) on conflict(user_id) do update set data = excluded.data;
end $$;
create function public.implanta_commit(p_changes jsonb, p_removed jsonb, p_preferences jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_typeof(p_removed) is distinct from 'array' then raise exception 'Alterações inválidas.'; end if;
  for item in select value from jsonb_array_elements(p_removed) loop
    perform public.implanta_delete_project(item->>'id', (item->>'version')::bigint);
  end loop;
  for item in select value from jsonb_array_elements(p_changes) loop
    if (item->>'create')::boolean then perform public.implanta_create_project(item->'data');
    else perform public.implanta_save_project(item->>'id', item->'data', (item->>'version')::bigint); end if;
  end loop;
  if p_preferences is not null then perform public.implanta_save_preferences(p_preferences); end if;
end $$;

revoke all on all functions in schema implanta_private from public, anon, authenticated;
grant execute on function implanta_private.enabled(), implanta_private.admin(), implanta_private.can_read(text), implanta_private.can_edit(text) to authenticated;
revoke all on function public.implanta_access(), public.implanta_admin_users(), public.implanta_set_user(uuid,text,boolean,boolean), public.implanta_grant_project(text,uuid,text),
  public.implanta_create_project(jsonb), public.implanta_save_project(text,jsonb,bigint), public.implanta_delete_project(text,bigint), public.implanta_save_preferences(jsonb), public.implanta_commit(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.implanta_access(), public.implanta_admin_users(), public.implanta_set_user(uuid,text,boolean,boolean), public.implanta_grant_project(text,uuid,text),
  public.implanta_create_project(jsonb), public.implanta_save_project(text,jsonb,bigint), public.implanta_delete_project(text,bigint), public.implanta_save_preferences(jsonb), public.implanta_commit(jsonb,jsonb,jsonb) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.implanta_notifications;
  end if;
end $$;
commit;
