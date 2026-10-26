-- Implanta 1.17.0 — portal opcional do cliente, por convite e código Supabase Auth.
-- Requer registros separados (202610240003) e flags (202610260001).
-- Não altera projetos, respostas, termos ou liberações existentes.
begin;
do $$ begin
 if to_regclass('implanta_private.record_tables') is null or to_regprocedure('implanta_private.implantation_stamp_question_v2(jsonb,jsonb)') is null then raise exception 'Ative primeiro os registros separados e o SQL 202610260001 das flags.'; end if;
end $$;
create table if not exists implanta_private.customer_invites(
 id uuid primary key default gen_random_uuid(),project_id text not null references public.implanta_projects(id) on delete cascade,
 entry_id text not null,responsible_id text not null,name text not null,job_title text not null,email text not null,
 created_by uuid references public.implanta_profiles(id) on delete set null,created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '7 days'),revoked_at timestamptz,last_requested_at timestamptz
);
create index if not exists customer_invites_scope on implanta_private.customer_invites(project_id,entry_id,responsible_id);
alter table implanta_private.customer_invites enable row level security;
revoke all on implanta_private.customer_invites from public,anon,authenticated;
create table if not exists public.implanta_customer_access_audit(
 id bigint generated always as identity primary key,project_id text not null,entry_id text not null,invite_id uuid,
 actor_id uuid,actor_name text not null,action text not null,question_id text,at timestamptz not null default now()
);
create index if not exists customer_access_audit_project_time on public.implanta_customer_access_audit(project_id,at desc);
alter table public.implanta_customer_access_audit enable row level security;
drop policy if exists customer_access_audit_read on public.implanta_customer_access_audit;
create policy customer_access_audit_read on public.implanta_customer_access_audit for select to authenticated using(implanta_private.can_read(project_id));
revoke all on public.implanta_customer_access_audit from public,anon,authenticated;
grant select on public.implanta_customer_access_audit to authenticated;
create or replace function implanta_private.customer_invite(p_invite uuid) returns implanta_private.customer_invites
language plpgsql stable security definer set search_path='' as $$
declare i implanta_private.customer_invites; m jsonb; r jsonb; mailbox text;
begin
 select lower(email) into mailbox from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from implanta_private.customer_invites where id=p_invite and revoked_at is null and expires_at>clock_timestamp() and email=mailbox;
 if i.id is null then raise exception 'Acesso indisponível. Confira o e-mail do convite ou solicite novo acesso à equipe.' using errcode='42501'; end if;
 select data into m from public.implanta_implantation_module_records where project_id=i.project_id and id=i.entry_id and data->>'included'='true';
 select x into r from jsonb_array_elements(coalesce(m->'responsibles','[]')) x where x->>'id'=i.responsible_id;
 if r is null or lower(trim(r->>'email'))<>i.email or r->>'name'<>i.name or r->>'role'<>i.job_title or not exists(select 1 from public.implanta_municipality_records where project_id=i.project_id and (data->'entities') ? (m->>'entity')) then raise exception 'Este cadastro ou relatório foi alterado. Solicite um novo convite.' using errcode='42501'; end if;
 return i;
end $$;
create or replace function public.implanta_customer_invites(p_project text,p_entry text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not implanta_private.can_edit(p_project) then raise exception 'Sem permissão para gerenciar este relatório.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(i) order by created_at desc) from implanta_private.customer_invites i where project_id=p_project and entry_id=p_entry),'[]');
end $$;
create or replace function public.implanta_customer_invite_create(p_project text,p_entry text,p_responsible text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m jsonb;r jsonb;i implanta_private.customer_invites;who text;
begin
 perform 1 from public.implanta_projects where id=p_project for update;
 if not implanta_private.can_edit(p_project) then raise exception 'Sem permissão para convidar clientes deste projeto.' using errcode='42501'; end if;
 if exists(select 1 from public.implanta_municipality_records where project_id=p_project and data->>'status'='closed') then raise exception 'Reabra o projeto antes de emitir novos convites.'; end if;
 select data into m from public.implanta_implantation_module_records where project_id=p_project and id=p_entry and data->>'included'='true';
 select x into r from jsonb_array_elements(coalesce(m->'responsibles','[]')) x where x->>'id'=p_responsible;
 if r is null or coalesce(r->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Salve nome, cargo e um e-mail válido do responsável antes de convidar.'; end if;
 update implanta_private.customer_invites set revoked_at=now() where project_id=p_project and entry_id=p_entry and responsible_id=p_responsible and revoked_at is null;
 insert into implanta_private.customer_invites(project_id,entry_id,responsible_id,name,job_title,email,created_by) values(p_project,p_entry,p_responsible,r->>'name',r->>'role',lower(trim(r->>'email')),auth.uid()) returning * into i;
 select display_name into who from public.implanta_profiles where id=auth.uid();
 insert into public.implanta_customer_access_audit(project_id,entry_id,invite_id,actor_id,actor_name,action) values(p_project,p_entry,i.id,auth.uid(),who,'invite_created');
 if jsonb_array_length(m->'responsibles')=1 then
  with assigned as(
   update public.implanta_implantation_question_records set data=jsonb_set(data,'{question,responsibleIds}',jsonb_build_array(p_responsible)),revision=revision+1,updated_at=now(),updated_by=auth.uid() where project_id=p_project and data->>'entryId'=p_entry and data->'question'->>'answer'='yes' and jsonb_array_length(data->'question'->'responsibleIds')=0 returning id
  ) insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name,changed_fields) select p_project,'implantation_question',id,'responsible_assigned',auth.uid(),who,array['responsibleIds'] from assigned;
  if found then update public.implanta_projects set version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_project; end if;
 end if;
 return to_jsonb(i);
end $$;
create or replace function public.implanta_customer_invite_action(p_invite uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare i implanta_private.customer_invites;who text;
begin
 select * into i from implanta_private.customer_invites where id=p_invite;
 perform 1 from public.implanta_projects where id=i.project_id for update;
 if i.id is null or not implanta_private.can_edit(i.project_id) then raise exception 'Sem permissão para este convite.' using errcode='42501'; end if;
 if p_action='revoke' then update implanta_private.customer_invites set revoked_at=coalesce(revoked_at,now()) where id=p_invite;
 elsif p_action='requested' then update implanta_private.customer_invites set last_requested_at=now() where id=p_invite and revoked_at is null;
 else raise exception 'Ação de convite inválida.'; end if;
 select display_name into who from public.implanta_profiles where id=auth.uid();
 insert into public.implanta_customer_access_audit(project_id,entry_id,invite_id,actor_id,actor_name,action) values(i.project_id,i.entry_id,i.id,auth.uid(),who,'invite_'||p_action);
end $$;
create or replace function public.implanta_customer_read(p_invite uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i implanta_private.customer_invites; m jsonb;p jsonb;points jsonb;total integer;ready boolean;
begin
 i:=implanta_private.customer_invite(p_invite);
 select data into m from public.implanta_implantation_module_records where project_id=i.project_id and id=i.entry_id;
 select data into p from public.implanta_municipality_records where project_id=i.project_id;
 select count(*) into total from public.implanta_implantation_question_records where project_id=i.project_id and data->>'entryId'=i.entry_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.data->'question'->'id','text',q.data->'question'->'text','help',q.data->'question'->'help','notes',q.data->'question'->'notes','revision',q.revision,'technical',jsonb_build_object('by',q.data->'question'->'technical'->'by','at',q.data->'question'->'technical'->'at'),'accepted',exists(select 1 from jsonb_array_elements(q.data->'question'->'clients') c where c->>'id'=i.responsible_id and c->>'origin'='customer-portal' and c->>'source'='server'),'recordedInternally',exists(select 1 from jsonb_array_elements(q.data->'question'->'clients') c where c->>'id'=i.responsible_id and coalesce(c->>'origin','')<>'customer-portal' and c->>'source'='server')) order by coalesce((select ordinality from jsonb_array_elements_text(m->'questionOrder') with ordinality where value=q.data->'question'->>'id'),999999)),'[]') into points
 from public.implanta_implantation_question_records q where q.project_id=i.project_id and q.data->>'entryId'=i.entry_id and q.data->'question'->>'answer'='yes' and q.data->'question'->'technical'->>'source'='server' and (q.data->'question'->'responsibleIds') ? i.responsible_id;
 ready:=implanta_private.implantation_ready(implanta_private.implantation_assembled(i.project_id),m->>'entity',p->'entities',m->>'module');
 return jsonb_build_object('projectName',p->>'name','entity',m->>'entity','module',m->>'module','name',i.name,'role',i.job_title,'email',i.email,'expiresAt',i.expires_at,'readOnly',p->>'status'='closed','points',points,'total',total,'ready',ready);
end $$;
create or replace function implanta_private.implantation_stamp_question_internal(value jsonb,previous jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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

-- The portal uses a private transaction context and constructs the entire delta
-- server-side. It never receives a question object or proof from the browser.
create or replace function implanta_private.implantation_stamp_question(value jsonb,previous jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i implanta_private.customer_invites;context uuid;result jsonb;c jsonb;
begin
 context:=nullif(current_setting('implanta.customer_invite',true),'')::uuid;
 if context is not null then
  i:=implanta_private.customer_invite(context);
  if (value-array['clients','responsibleIds']) is distinct from (previous-array['clients','responsibleIds']) or value->'responsibleIds' is distinct from previous->'responsibleIds' or value->>'answer'<>'yes' or value->'technical'->>'source'<>'server' or
    (select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(value->'clients') x where x->>'id'<>i.responsible_id) is distinct from (select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(previous->'clients') x where x->>'id'<>i.responsible_id) then raise exception 'O portal só pode registrar o próprio aceite sem modificar a apresentação.' using errcode='42501'; end if;
  for c in select x from jsonb_array_elements(value->'clients') x where x->>'id'=i.responsible_id loop
   if c->>'origin'<>'customer-portal' or c->>'actorId'<>auth.uid()::text or c->>'clientName'<>i.name or c->>'clientRole'<>i.job_title or c->>'inviteId'<>i.id::text then raise exception 'Identidade do aceite externo inválida.' using errcode='42501'; end if;
  end loop;
  return value;
 end if;
 for c in select x from jsonb_array_elements(coalesce(value->'clients','[]')) x where x->>'origin'='customer-portal' and x->>'source'<>'imported-unverified' loop
  if not exists(select 1 from jsonb_array_elements(coalesce(previous->'clients','[]')) old where old=c) then raise exception 'Aceites externos devem ser registrados pelo próprio cliente no portal.' using errcode='42501'; end if;
 end loop;
 result:=implanta_private.implantation_stamp_question_internal(value,previous);
 -- Internal assignment of another responsible must not overwrite an unchanged
 -- external customer's identity or silently remove that person's confirmation.
 for c in select x from jsonb_array_elements(coalesce(value->'clients','[]')) x where x->>'origin'='customer-portal' loop
  if not exists(select 1 from jsonb_array_elements(result->'clients') x where x->>'id'=c->>'id') and result->'technical'=previous->'technical' then
   result:=jsonb_set(result,'{clients}',result->'clients'||jsonb_build_array(c));
  end if;
 end loop;
 return result;
end $$;
create or replace function public.implanta_customer_accept(p_invite uuid,p_question text,p_revision bigint,p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i implanta_private.customer_invites; rec public.implanta_implantation_question_records; q jsonb;proof jsonb;stamp text;old_context text:=current_setting('implanta.customer_invite',true);
begin
 if p_accept is null then raise exception 'Informe se deseja confirmar ou retirar o aceite.' using errcode='23514'; end if;
 i:=implanta_private.customer_invite(p_invite);
 perform 1 from public.implanta_projects where id=i.project_id for update;
 -- Recheck after the lock: revocation/technical edits also lock the project.
 i:=implanta_private.customer_invite(p_invite);
 if exists(select 1 from public.implanta_municipality_records where project_id=i.project_id and data->>'status'='closed') then raise exception 'O projeto está encerrado. Consulte o relatório ou fale com a equipe.'; end if;
 select * into rec from public.implanta_implantation_question_records where project_id=i.project_id and data->>'entryId'=i.entry_id and data->'question'->>'id'=p_question for update;
 if rec.id is null or rec.revision is distinct from p_revision then raise exception 'O ponto foi atualizado. Confira a versão atual antes de confirmar.' using errcode='40001'; end if;
 q:=rec.data->'question';
 if not (q->'responsibleIds') ? i.responsible_id then raise exception 'Este ponto não foi atribuído a você.' using errcode='42501'; end if;
 if q->>'answer'<>'yes' or q->'technical'->>'source' is distinct from 'server' then raise exception 'Aguarde a apresentação e o aceite do técnico.' using errcode='23514'; end if;
 stamp:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 q:=jsonb_set(q,'{clients}',coalesce((select jsonb_agg(c) from jsonb_array_elements(q->'clients') c where c->>'id'<>i.responsible_id),'[]'));
 if p_accept then
  proof:=jsonb_build_object('id',i.responsible_id,'clientName',i.name,'clientRole',i.job_title,'actorId',auth.uid(),'by',i.name,'at',stamp,'source','server','origin','customer-portal','inviteId',i.id);
  q:=jsonb_set(q,'{clients}',q->'clients'||jsonb_build_array(proof));

 end if;
 perform set_config('implanta.customer_invite',i.id::text,true);
 update public.implanta_implantation_question_records set data=jsonb_set(data,'{question}',q),revision=revision+1,updated_at=now(),updated_by=auth.uid() where project_id=i.project_id and id=rec.id;
 perform set_config('implanta.customer_invite',coalesce(old_context,''),true);
 update public.implanta_projects set version=version+1,updated_at=now(),updated_by=auth.uid() where id=i.project_id;
 insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name,changed_fields) values(i.project_id,'implantation_question',rec.id,case when p_accept then 'customer_accept' else 'customer_withdraw' end,auth.uid(),i.name,array['clients']);
 insert into public.implanta_customer_access_audit(project_id,entry_id,invite_id,actor_id,actor_name,action,question_id) values(i.project_id,i.entry_id,i.id,auth.uid(),i.name,case when p_accept then 'accepted' else 'withdrawn' end,p_question);
 return public.implanta_customer_read(p_invite);
end $$;
create or replace function public.implanta_customer_report(p_invite uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i implanta_private.customer_invites;m jsonb;p jsonb;v jsonb;snapshot jsonb;t jsonb;
begin
 i:=implanta_private.customer_invite(p_invite);
 perform 1 from public.implanta_projects where id=i.project_id for update;
 i:=implanta_private.customer_invite(p_invite);
 select data into m from public.implanta_implantation_module_records where project_id=i.project_id and id=i.entry_id;
 select data into p from public.implanta_municipality_records where project_id=i.project_id;
 v:=implanta_private.implantation_assembled(i.project_id);
 if not implanta_private.implantation_ready(v,m->>'entity',p->'entities',m->>'module') then raise exception 'Resolva os pontos e aguarde todos os aceites antes de gerar o relatório final.'; end if;
 snapshot:=implanta_private.implantation_snapshot(p,v,m->>'entity',m->>'module');
 select data into t from public.implanta_implantation_term_records where project_id=i.project_id and data->>'entity'=m->>'entity' and data->>'module'=m->>'module' and data->'snapshot'=snapshot and data->>'source'='server' order by data->>'at' desc limit 1;
 if t is null then
  if p->>'status'='closed' then raise exception 'O projeto está encerrado. Solicite o termo à equipe.'; end if;
  t:=jsonb_build_object('id',gen_random_uuid()::text,'entity',m->>'entity','module',m->>'module','actorId',auth.uid(),'actorName',i.name,'at',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'source','server','origin','customer-portal','snapshot',snapshot);
  insert into public.implanta_implantation_term_records(project_id,id,data,updated_at,updated_by) values(i.project_id,t->>'id',t,now(),auth.uid()) returning data into t;
  update public.implanta_projects set version=version+1,updated_at=now(),updated_by=auth.uid() where id=i.project_id;
  insert into public.implanta_record_audit(project_id,kind,record_id,action,actor_id,actor_name,changed_fields) values(i.project_id,'implantation_term',t->>'id','customer_term_issued',auth.uid(),i.name,array['snapshot']);
  insert into public.implanta_customer_access_audit(project_id,entry_id,invite_id,actor_id,actor_name,action) values(i.project_id,i.entry_id,i.id,auth.uid(),i.name,'term_issued');
 end if;
 return t;
end $$;
revoke all on function implanta_private.customer_invite(uuid),implanta_private.implantation_stamp_question_internal(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.implanta_customer_invites(text,text),public.implanta_customer_invite_create(text,text,text),public.implanta_customer_invite_action(uuid,text),public.implanta_customer_read(uuid),public.implanta_customer_accept(uuid,text,bigint,boolean),public.implanta_customer_report(uuid) from public,anon;
grant execute on function public.implanta_customer_invites(text,text),public.implanta_customer_invite_create(text,text,text),public.implanta_customer_invite_action(uuid,text),public.implanta_customer_read(uuid),public.implanta_customer_accept(uuid,text,bigint,boolean),public.implanta_customer_report(uuid) to authenticated;
create or replace function public.implanta_admin_users() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not implanta_private.admin() then raise exception 'Acesso Master necessário.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'name',p.display_name,'active',p.active,'externalCustomer',not p.active and exists(select 1 from implanta_private.customer_invites ci where ci.email=lower(p.email)),
    'admin',exists(select 1 from implanta_private.admins a where a.user_id=p.id),
    'master',exists(select 1 from implanta_private.admins a where a.user_id=p.id),
    'ownedProjects',coalesce((select jsonb_agg(j.id) from public.implanta_projects j where j.owner_id=p.id),'[]'))
    order by p.display_name),'[]') from public.implanta_profiles p);
end $$;

notify pgrst,'reload schema';
commit;
