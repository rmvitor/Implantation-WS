-- Complemento da homologação: modelos globais Master, dispensa justificada e termos por módulo.
-- Execute DEPOIS de 202610240001_implantation_acceptance.sql. Não reaplica estrutura nem apaga dados.
begin;
do $$ begin
 if to_regprocedure('public.implanta_implantation_capabilities()') is null then raise exception 'Execute primeiro 202610240001_implantation_acceptance.sql.'; end if;
end $$;
create table if not exists public.implanta_implantation_templates(
 module text primary key, version text not null, revision bigint not null default 1,
 questions jsonb not null check(jsonb_typeof(questions)='array'),
 updated_at timestamptz not null default now(),updated_by uuid references public.implanta_profiles(id) on delete set null
);
alter table public.implanta_implantation_templates enable row level security;
drop policy if exists templates_read on public.implanta_implantation_templates;
create policy templates_read on public.implanta_implantation_templates for select to authenticated using(implanta_private.enabled());
revoke all on public.implanta_implantation_templates from public,anon,authenticated;
grant select on public.implanta_implantation_templates to authenticated;
create or replace function implanta_private.implantation_definition(q jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',q->>'id','text',q->>'text','help',coalesce(q->>'help',''),'condition',coalesce(q->>'condition',''),'kind',q->>'kind','justifyWhen',q->>'justifyWhen')
$$;
create or replace function implanta_private.implantation_definitions(qs jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(implanta_private.implantation_definition(value) order by ordinality),'[]') from jsonb_array_elements(qs) with ordinality
$$;
insert into public.implanta_implantation_templates(module,version,questions) values('Compras e Contratos','2026-3','[{"id":"01","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Fornecedores?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Documentos do Fornecedores?","help":"Compras e Contratos » Cadastros » Enquadramento Pessoas » Fornecedor » Fornecedor » Aba Documentos","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Usuários estão aptos a efetuar a manutenção no cadastro de Certificados de Registro Cadastral?","help":"Compras e Contratos » Cadastros » Enquadramento Pessoas » Fornecedor » Fornecedor » Aba Certificado","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Gestor/Fiscal?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Comissões?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Usuários estão aptos a efetuar a manutenção e gerenciamento do Processo Administrativo?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Usuários estão aptos a efetuar a manutenção e gerenciamento dos Contratos e Aditivos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Usuários estão aptos a efetuar a manutenção e gerenciamento das Parcerias da Administração Pública (Lei 13.019/2014?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Usuários estão aptos a efetuar a manutenção das Ordens de Compra?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Usuários estão aptos a efetuar a manutenção das Requisições de Compras?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"12","text":"Usuários estão aptos a efetuar a manutenção das Solicitações de Compras?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"13","text":"Usuários estão aptos a efetuar a manutenção no DFD (Documento de Formalização de Demanda)?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"14","text":"Usuários estão aptos a efetuar a manutenção no ETP (Estudo Técnico Preliminar)?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"15","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"16","text":"Verificar se as possibilidades de preenchimento da Planilha de Preços pelo Portal de Serviços foram repassadas ao cliente:","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"17","text":"Layout da Requisição ao Compras foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"18","text":"Layout da Solicitação ao Compras foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"19","text":"Cliente optou por utilizar os Layouts dos Editais padrão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"20","text":"Cliente optou por utilizar os Layouts dos Contratos padrão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"21","text":"Cliente optou por utilizar os Layouts dos Pareceres padrão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"22","text":"Cliente optou por utilizar os Layouts das Atas de Pregão do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"23","text":"Cliente optou por utilizar os Layouts das Atas de Registro de Preços do sistema?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"24","text":"Foi desenvolvido layouts para as Atas do Registro de Preços?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"25","text":"Foi repassado ao cliente como cadastrar as Revogações, Anulações e Recursos das licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"26","text":"Foi repassado ao cliente como utilizar as propostas eletrônicas no portal de serviços?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"27","text":"Foi repassado ao cliente como Desclassificar/Anular participantes e propostas e como isso afeta o fluxo após a etapa de lances?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"28","text":"Foi repassado ao cliente como realizar a Readequação de Lotes?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"29","text":"Foi ajustada a Adjudicação de todas as Licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"30","text":"Os saldos de todas as Licitações estão corretos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"31","text":"Os saldos de todos os Contratos estão corretos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"32","text":"Foi repassado como realizar a exportação e importação do Pregão Eletrônico?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"33","text":"Foi repassado como gerar Contratos para Compras Diretas ou sem vínculo com as Licitações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"34","text":"Foi repassado como é realizado o envio dos Arquivos via WebService ou E-validador (Licitacon)?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"35","text":"Foi repassado como consultar o Log de Erros?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"36","text":"Foi repassado como realizar o Ajuste de Numeração dos Contratos via “Reajuste TC”?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"37","text":"Foi repassado como realizar o Reajuste da Numeração das Comissões via “Reajuste TC”?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"38","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"39","text":"Foi repassado como corrige lançamentos dos Editais ao PNCP?","help":"Compras e Contratos » PNCP » Gerenciar » Editais","condition":"","kind":"capability","justifyWhen":"no"},{"id":"40","text":"Foi repassado como corrige lançamentos dos contratos ao PNCP?","help":"Compras e Contratos » PNCP » Gerenciar » Contratos","condition":"","kind":"capability","justifyWhen":"no"},{"id":"41","text":"Foi repassado como corrige lançamentos das ATAS ao PNCP ?","help":"Compras e Contratos » PNCP » Gerenciar » Atas RP","condition":"","kind":"capability","justifyWhen":"no"},{"id":"42","text":"Foi repassado como é feita a inclusão de ativos de contrato e seus respectivos tipos?","help":"Compras e Contratos » Gerenciar » Processo Administrativo » Gerenciamento do Processo Administrativo: XXX / 2026 - Processo de Inexigibilidade X / 2026 - MINUTA [XXXX / 2026 ] » Consultar Contratos » Consultar Aditivos dos Contratos Superiores - [XX/2026 - XXX]","condition":"","kind":"capability","justifyWhen":"no"},{"id":"43","text":"Foi repassado como é feita a inclusão de novos recursos na adjudicação?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"44","text":"Foi repassado como é feito o reajuste de valor dos itens do registro de preço e adicionar quantidades?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"45","text":"Cliente foi orientado de quais anexos obrigatórios e suas publicações?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"46","text":"Cliente foi orientado de como Incluir relacionamento recurso x item?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"47","text":"Cliente optou por utilizar processo digital na requisição, ordem de compra e processo administrativo?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"48","text":"Existem pendências que impeçam o funcionamento do módulo Compras, Licitações e Contratos?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Almoxarifado','2026-3','[{"id":"01","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Comissões de Inventário?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Usuários estão aptos a efetuar a manutenção do cadastro de Depósitos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Usuários estão aptos a efetuar a manutenção de Produtos x Depósitos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Usuários estão aptos a efetuar a manutenção das Entradas de Produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Layout das guias de Entrada foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Usuários estão aptos a efetuar a manutenção das Saídas de Produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Layout das guias de Saída foi homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Usuários estão aptos a incluir Transferência de Produtos entre Depósitos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Usuários estão aptos a efetuar a manutenção do Ponto de Ressuprimento?","help":"Suprimentos >> Almoxarifado >> Cadastros >> Depósito >> Produto x Depósito","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Usuários estão aptos a efetuar a Requisição ao Almoxarifado?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Layout da Guia de Requisição ao Almoxarifado está homologado com o cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"12","text":"Usuários estão aptos a utilizar a rotina de Cotas de Consumo?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"13","text":"Usuários estão aptos a utilizar a rotina de Virada Mensal de Estoque?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"14","text":"A Entidade irá Efetuar Contabilização (Integração com a Contabilidade)?","help":"","condition":"","kind":"choice","justifyWhen":"no"},{"id":"15","text":"Se a resposta anterior for SIM: Foi repassado como funcionam os cadastros de Classe Produto x Conta (apenas modo manual) e Classe Produto x Conta x Tipo de Movimentação (modo automático)?","help":"","condition":"Aplica-se quando a entidade fará integração com a contabilidade.","kind":"capability","justifyWhen":"no"},{"id":"16","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao Cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"17","text":"Existem pendências que impeçam o funcionamento do módulo Almoxarifado?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Patrimônio','2026-3','[{"id":"01","text":"Usuários estão aptos a efetuar a solicitação de cadastro de produtos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Usuários estão aptos a efetuar a manutenção dos Motivos de Baixa?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Usuários estão aptos a efetuar a manutenção das Taxas de Depreciação?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Usuários estão aptos a efetuar a manutenção do Cadastro de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Usuários estão aptos a efetuar a manutenção de Incorporação de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Usuários estão aptos a efetuar a manutenção de Inventários?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Usuários estão aptos a efetuar a manutenção de Agregação de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Usuários estão aptos a realizar Transferência de Bens Interna?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Usuários estão aptos a realizar Transferência de Bens Externa?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Usuários estão aptos a realizar Transferência de Bens por Entidade?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Layout do Termo de Transferência foi homologado com o usuário?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"12","text":"Usuários estão aptos a efetuar a Baixa de Bens?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"13","text":"Usuários estão aptos a utilizar a Movimentação Financeira?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"14","text":"O Balancete Patrimonial está fechando com o da Contabilidade? Se não, quais medidas foram tomadas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"15","text":"Foi repassado como funciona a Impressão de Etiquetas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"16","text":"Usuários estão aptos a efetuar a Virada Mensal?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"17","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao Cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"18","text":"Existem pendências que impeçam o completo funcionamento do módulo Patrimônio?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Frota','2026-3','[{"id":"01","text":"Os usuários estão aptos a efetuar a manutenção do cadastro de Motoristas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"02","text":"Os usuários estão aptos a efetuar a manutenção do cadastro de Rotas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"03","text":"Os usuários estão aptos a efetuar a manutenção do cadastro de Veículos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"04","text":"Os usuários estão aptos a efetuar a manutenção do Vencimento do IPVA?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"05","text":"Os usuários estão aptos a efetuar o Agendamento de Veículos?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"06","text":"Os usuários estão aptos a utilizar a rotina de Despesa?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"07","text":"Os usuários estão aptos a utilizar a rotina de Manutenção?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"08","text":"Os usuários estão aptos a utilizar a rotina de Entradas/Saídas?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"09","text":"Os usuários estão aptos a utilizar a rotina de Virada Anual?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"10","text":"Os Relatórios pertinentes e que serão utilizados no cotidiano foram apresentados ao Cliente?","help":"","condition":"","kind":"capability","justifyWhen":"no"},{"id":"11","text":"Existem pendências que impeçam o funcionamento do módulo Frota?","help":"","condition":"","kind":"blocking","justifyWhen":"yes"}]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Fiscalização de contrato','personalizado','[]'::jsonb) on conflict(module) do nothing;
insert into public.implanta_implantation_templates(module,version,questions) values('Elicita','personalizado','[]'::jsonb) on conflict(module) do nothing;

create or replace function public.implanta_implantation_templates() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('module',module,'version',version,'revision',revision,'questions',questions,'updatedAt',updated_at) order by module) from public.implanta_implantation_templates),'[]');
end $$;
create table if not exists public.implanta_implantation_template_audit(
 id bigint generated always as identity primary key,module text not null,revision bigint not null,
 actor_id uuid references public.implanta_profiles(id) on delete set null,actor_name text not null,
 at timestamptz not null default now(),before_data jsonb not null,after_data jsonb not null
);
alter table public.implanta_implantation_template_audit enable row level security;
drop policy if exists template_audit_read on public.implanta_implantation_template_audit;
create policy template_audit_read on public.implanta_implantation_template_audit for select to authenticated using(implanta_private.admin());
revoke all on public.implanta_implantation_template_audit from public,anon,authenticated;
grant select on public.implanta_implantation_template_audit to authenticated;
create or replace function public.implanta_save_implantation_template(p_module text,p_questions jsonb,p_revision bigint,p_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; result jsonb; previous jsonb; changed jsonb; actor text;
begin
 if not implanta_private.admin() then raise exception 'Somente o Master pode gerenciar modelos globais.' using errcode='42501'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' or octet_length(p_questions::text)>1048576 or coalesce(trim(p_version),'')='' then raise exception 'Modelo inválido.'; end if;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_questions) x) then raise exception 'Identificações de perguntas repetidas.'; end if;
 for q in select * from jsonb_array_elements(p_questions) loop
  if coalesce(q->>'id','')='' or coalesce(trim(q->>'text'),'')='' or coalesce(q->>'kind','') not in ('capability','choice','blocking') or coalesce(q->>'justifyWhen','') not in ('yes','no') or (q ? 'help' and jsonb_typeof(q->'help')<>'string') or (q ? 'condition' and jsonb_typeof(q->'condition')<>'string') then raise exception 'Confira texto, tipo e orientação de cada pergunta.'; end if;
 end loop;
 select to_jsonb(m) into previous from public.implanta_implantation_templates m where module=p_module for update;
 select display_name into actor from public.implanta_profiles where id=auth.uid();
 update public.implanta_implantation_templates set version=trim(p_version),questions=implanta_private.implantation_definitions(p_questions),revision=revision+1,updated_at=now(),updated_by=auth.uid() where module=p_module and revision=p_revision;
 if not found then raise exception 'Outro Master alterou este modelo. Recarregue antes de editar.' using errcode='40001'; end if;
 select to_jsonb(m) into changed from public.implanta_implantation_templates m where module=p_module;
 insert into public.implanta_implantation_template_audit(module,revision,actor_id,actor_name,before_data,after_data) values(p_module,(changed->>'revision')::bigint,auth.uid(),coalesce(actor,auth.uid()::text),previous,changed);
 return public.implanta_implantation_templates();
end $$;
create or replace function implanta_private.implantation_check_entry(value jsonb,previous jsonb) returns void language plpgsql security definer set search_path='' as $$
declare model public.implanta_implantation_templates%rowtype;
begin
 if previous->>'included'='true' and value->>'included'='true' and (value->'modelRevision' is distinct from previous->'modelRevision' or value->'modelVersion' is distinct from previous->'modelVersion') and not implanta_private.admin() then raise exception 'Somente o Master pode atualizar o modelo do relatório.' using errcode='42501'; end if;
 if previous->>'included'='true' and value->>'included'='false' and jsonb_array_length(value->'questions')<>0 then raise exception 'Desativar o relatório exige apagar as respostas após confirmação.'; end if;
 if value->>'included'='false' and jsonb_array_length(value->'questions')=0 then return; end if;
 if previous is not null and implanta_private.implantation_definitions(value->'questions')=implanta_private.implantation_definitions(previous->'questions') then return; end if;
 if not implanta_private.admin() then
  if previous is not null and previous->>'included'='true' then raise exception 'Somente o Master pode editar perguntas.' using errcode='42501'; end if;
  select * into model from public.implanta_implantation_templates where module=value->>'module';
  if model.module is null or jsonb_array_length(model.questions)=0 then raise exception 'Cadastre primeiro um modelo global de perguntas para este módulo.'; end if;
  if coalesce(value->>'modelRevision','0')::bigint<>model.revision or implanta_private.implantation_definitions(value->'questions')<>model.questions then raise exception 'Atualize os modelos antes de ativar o relatório.' using errcode='40001'; end if;
 end if;
end $$;

create or replace function implanta_private.implantation_stamp_question(value jsonb, previous jsonb) returns jsonb
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
      if q ? 'notUsed' and (jsonb_typeof(q->'notUsed') is distinct from 'boolean' or (q->>'notUsed'='true' and (q->>'answer'<>'no' or q->>'kind'='blocking'))) then raise exception 'A dispensa exige resposta Não e justificativa.'; end if;
      if (q->>'answer'='na' or q->>'answer'=q->>'justifyWhen' or q->>'notUsed'='true') and coalesce(trim(q->>'notes'),'')='' and (coalesce(q->'technical','null')<>'null'::jsonb or jsonb_array_length(q->'clients')>0) then raise exception 'Justifique a resposta do checklist.'; end if;
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
create or replace function implanta_private.implantation_ready(value jsonb, entity text, entities jsonb, module text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and entities ? entity and (module='' or e->>'module'=module))
 and not exists(select 1 from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and (module='' or e->>'module'=module) and (
 jsonb_array_length(e->'questions')=0 or exists(select 1 from jsonb_array_elements(e->'questions') q where
 coalesce(q->>'answer','')='' or ((q->>'answer'='na' or q->>'answer'=q->>'justifyWhen' or q->>'notUsed'='true') and coalesce(trim(q->>'notes'),'')='') or
 (q->>'kind'='capability' and q->>'answer'='no' and coalesce(q->>'notUsed','false')<>'true') or (q->>'kind'='blocking' and q->>'answer'='yes') or
 coalesce(q->'technical'->>'source','')<>'server' or jsonb_array_length(q->'responsibleIds')=0 or
 exists(select 1 from jsonb_array_elements_text(q->'responsibleIds') id where not exists(select 1 from jsonb_array_elements(q->'clients') c where c->>'id'=id and c->>'source'='server')))))
$$;
create or replace function implanta_private.implantation_ready(value jsonb, entity text, entities jsonb) returns boolean language sql stable set search_path='' as $$ select implanta_private.implantation_ready(value,entity,entities,'') $$;
create or replace function implanta_private.implantation_snapshot(project_data jsonb,value jsonb,entity text,module text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('projectId',project_data->>'id','projectName',project_data->>'name','state',coalesce(project_data->>'state',''),'dream',coalesce(project_data->>'dream',''),'fiscal',coalesce(project_data->>'fiscal',''),'entity',entity,
 'entries',coalesce((select jsonb_agg(e) from jsonb_array_elements(value->'entries') e where e->>'included'='true' and e->>'entity'=entity and project_data->'entities' ? entity and (module='' or e->>'module'=module)),'[]')) || case when module='' then '{}'::jsonb else jsonb_build_object('module',module) end
$$;
create or replace function implanta_private.implantation_snapshot(project_data jsonb,value jsonb,entity text) returns jsonb language sql stable set search_path='' as $$ select implanta_private.implantation_snapshot(project_data,value,entity,'') $$;

create or replace function implanta_private.implantation_verify_term(term jsonb, project_data jsonb, value jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if coalesce(term->>'module','')<>'' and (term->'snapshot'->>'module' is distinct from term->>'module' or exists(select 1 from jsonb_array_elements(term->'snapshot'->'entries') e where e->>'module' is distinct from term->>'module')) then raise exception 'Escopo do termo por módulo inválido.'; end if;
  if term->>'source'='imported-unverified' then
    perform implanta_private.implantation_validate(jsonb_build_object('version',1,'entries',term->'snapshot'->'entries','terms','[]'::jsonb));
    return;
  end if;
  if not implanta_private.implantation_ready(value,term->>'entity',project_data->'entities',coalesce(term->>'module','')) then raise exception 'Resolva os impedimentos e registre todos os OKs antes de emitir o termo.'; end if;
  if term->'snapshot' is distinct from implanta_private.implantation_snapshot(project_data,value,term->>'entity',coalesce(term->>'module','')) then raise exception 'Os dados mudaram. Atualize a homologação antes de gerar o termo.' using errcode='40001'; end if;
end $$;
-- An already-entered legacy create RPC must not create a snapshot-only project
-- after cutover. The v2 RPC creates its municipality in the same transaction.
create or replace function implanta_private.implantation_project_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('implanta_private.record_tables') is not null and exists(select 1 from public.implanta_projects where id=new.id) then
  if not exists(select 1 from public.implanta_municipality_records where project_id=new.id and id=new.id) then
   raise exception 'O banco usa registros separados. Atualize o aplicativo antes de criar projetos.' using errcode='55000';
  end if;
 end if;
 return null;
end $$;
revoke all on function implanta_private.implantation_project_created() from public,anon,authenticated;
drop trigger if exists implanta_implantation_project_created on public.implanta_projects;
create constraint trigger implanta_implantation_project_created after insert on public.implanta_projects deferrable initially deferred for each row execute function implanta_private.implantation_project_created();
create or replace function implanta_private.implantation_legacy_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare value jsonb; previous jsonb; e jsonb; old_entry jsonb; q jsonb; old_q jsonb; t jsonb; old_term jsonb; entries jsonb:='[]'; questions jsonb; terms jsonb:='[]'; identity jsonb;
begin
  if to_regclass('implanta_private.record_tables') is not null then
    -- Retained snapshots are read-only after cutover, including old RPCs that
    -- began before migration and resumed after the table lock was released.
    if tg_op='UPDATE' and new.data is distinct from old.data then
      raise exception 'O banco usa registros separados. Atualize o aplicativo antes de salvar.' using errcode='55000';
    end if;
    return new;
  end if;
  previous:=case when tg_op='UPDATE' then old.data->'implantation' else null end;
  if previous is not null and not new.data ? 'implantation' then new.data:=new.data || jsonb_build_object('implantation',previous); end if;
  value:=new.data->'implantation';
  if value is null then return new; end if;
  if value is not distinct from previous then return new; end if;
  if not implanta_private.can_edit(new.id) and tg_op<>'INSERT' then raise exception 'Sem permissão para editar esta homologação.' using errcode='42501'; end if;
  for e in select * from jsonb_array_elements(value->'entries') loop
    select x into old_entry from jsonb_array_elements(coalesce(previous->'entries','[]')) x where x->>'id'=e->>'id';
    perform implanta_private.implantation_check_entry(e,old_entry);
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

-- Only trusted module transitions authorize editor creation of standard points.
create or replace function implanta_private.implantation_policy_prepare() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb; flags jsonb; key text;
begin
 if tg_op='UPDATE' then previous:=old.data; else select data into previous from public.implanta_implantation_module_records where project_id=new.project_id and id=new.id; end if;
 if new.data->>'included'='true' and (previous is null or previous->>'included'='false') then
  flags:=coalesce(nullif(current_setting('implanta.acceptance_activations',true),'')::jsonb,'{}');
  key:=jsonb_build_array(new.project_id,new.id)::text;
  perform set_config('implanta.acceptance_activations',(flags || jsonb_build_object(key,true))::text,true);
 end if;
 if previous->>'included'='true' and new.data->>'included'='true' and (new.data->'modelRevision' is distinct from previous->'modelRevision' or new.data->'modelVersion' is distinct from previous->'modelVersion' or new.data->'questionOrder' is distinct from previous->'questionOrder') and not implanta_private.admin() then raise exception 'Somente o Master pode atualizar as perguntas do relatório.' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists implantation_policy_prepare on public.implanta_implantation_module_records;
create trigger implantation_policy_prepare before insert or update on public.implanta_implantation_module_records for each row execute function implanta_private.implantation_policy_prepare();
create or replace function implanta_private.implantation_policy_final() returns trigger language plpgsql security definer set search_path='' as $$
declare project text; entry text; m jsonb; model public.implanta_implantation_templates%rowtype; flags jsonb; e jsonb;
begin
 project:=case when tg_op='DELETE' then old.project_id else new.project_id end;
 if not exists(select 1 from public.implanta_projects where id=project) then return null; end if;
 flags:=coalesce(nullif(current_setting('implanta.acceptance_activations',true),'')::jsonb,'{}');
 if tg_argv[0]='module' then
  if tg_op='DELETE' and not implanta_private.admin() then raise exception 'Desative o relatório para apagar suas respostas.' using errcode='42501'; end if;
  if tg_op<>'DELETE' then
   if tg_op='UPDATE' and old.data->>'included'='true' and new.data->>'included'='false' then
    if exists(select 1 from public.implanta_implantation_question_records where project_id=project and data->>'entryId'=new.id) then raise exception 'Desativar o relatório exige apagar suas respostas.'; end if;
   end if;
   if new.data->>'included'='true' and (tg_op='INSERT' or old.data->>'included'='false') then
    select * into model from public.implanta_implantation_templates where module=new.data->>'module';
    if model.module is null or jsonb_array_length(model.questions)=0 then raise exception 'Este módulo não possui modelo de perguntas.'; end if;
    if not implanta_private.admin() then
     e:=new.data || jsonb_build_object('questions',coalesce((select jsonb_agg(q.data->'question' order by coalesce((select ordinality from jsonb_array_elements_text(new.data->'questionOrder') with ordinality where value=q.data->'question'->>'id'),999999)) from public.implanta_implantation_question_records q where q.project_id=project and q.data->>'entryId'=new.id),'[]'));
     if coalesce(new.data->>'modelRevision','0')::bigint<>model.revision or implanta_private.implantation_definitions(e->'questions')<>model.questions then raise exception 'Atualize o modelo antes de ativar o relatório.' using errcode='40001'; end if;
    end if;
   end if;
  end if;
 else
  entry:=case when tg_op='DELETE' then old.data->>'entryId' else new.data->>'entryId' end;
  select data into m from public.implanta_implantation_module_records where project_id=project and id=entry;
  if tg_op='DELETE' then
   if m->>'included'='true' and not implanta_private.admin() then raise exception 'Somente o Master pode excluir perguntas de um relatório ativo.' using errcode='42501'; end if;
  elsif (tg_op='INSERT' or implanta_private.implantation_definition(new.data->'question') is distinct from implanta_private.implantation_definition(old.data->'question')) and not implanta_private.admin() then
   if tg_op='UPDATE' or not flags ? (jsonb_build_array(project,entry)::text) then raise exception 'Somente o Master pode editar perguntas.' using errcode='42501'; end if;
   select * into model from public.implanta_implantation_templates where module=m->>'module';
   if not exists(select 1 from jsonb_array_elements(model.questions) q where q=implanta_private.implantation_definition(new.data->'question')) then raise exception 'Use as perguntas do modelo global.' using errcode='42501'; end if;
  end if;
 end if;
 return null;
end $$;
drop trigger if exists implantation_policy_final on public.implanta_implantation_module_records;
create constraint trigger implantation_policy_final after insert or update or delete on public.implanta_implantation_module_records deferrable initially deferred for each row execute function implanta_private.implantation_policy_final('module');
drop trigger if exists implantation_policy_final on public.implanta_implantation_question_records;
create constraint trigger implantation_policy_final after insert or update or delete on public.implanta_implantation_question_records deferrable initially deferred for each row execute function implanta_private.implantation_policy_final('question');
create or replace function public.implanta_implantation_capabilities() returns jsonb language plpgsql security definer set search_path='' as $$
declare count_kinds integer:=0;
begin
 if not implanta_private.enabled() then raise exception 'Seu acesso não está liberado.' using errcode='42501'; end if;
 if to_regclass('implanta_private.record_tables') is not null then
  execute 'select count(*) from implanta_private.record_tables where kind in (''implantation'',''implantation_module'',''implantation_question'',''implantation_term'')' into count_kinds;
  if count_kinds<>4 then return jsonb_build_object('version',0); end if;
 end if;
 return jsonb_build_object('version',1,'workflowVersion',2);
end $$;
revoke all on function public.implanta_implantation_templates(),public.implanta_save_implantation_template(text,jsonb,bigint,text) from public,anon;
grant execute on function public.implanta_implantation_templates(),public.implanta_save_implantation_template(text,jsonb,bigint,text) to authenticated;
revoke all on function implanta_private.implantation_definition(jsonb),implanta_private.implantation_definitions(jsonb),implanta_private.implantation_check_entry(jsonb,jsonb),implanta_private.implantation_policy_prepare(),implanta_private.implantation_policy_final(),implanta_private.implantation_ready(jsonb,text,jsonb,text),implanta_private.implantation_snapshot(jsonb,jsonb,text,text) from public,anon,authenticated;

-- Bulk activation (up to many entities) validates the full state once, not once
-- per point. Any further write resets the marker, including immediate constraints.
create index if not exists implanta_question_by_module on public.implanta_implantation_question_records(project_id,(data->>'entryId'));
create or replace function implanta_private.implantation_validation_dirty() returns trigger language plpgsql security definer set search_path='' as $$
declare project text:=case when tg_op='DELETE' then old.project_id else new.project_id end; flags jsonb;
begin
 flags:=coalesce(nullif(current_setting('implanta.acceptance_validated',true),'')::jsonb,'{}');
 perform set_config('implanta.acceptance_validated',(flags-project)::text,true);
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare kind text; begin
 foreach kind in array array['implantation','implantation_module','implantation_question','implantation_term'] loop
 execute format('drop trigger if exists implantation_validation_dirty on public.implanta_%s_records',kind);
 execute format('create trigger implantation_validation_dirty before insert or update or delete on public.implanta_%s_records for each row execute function implanta_private.implantation_validation_dirty()',kind);
 end loop;
end $$;
create or replace function implanta_private.implantation_final_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare project text:=case when tg_op='DELETE' then old.project_id else new.project_id end; value jsonb; project_data jsonb; flags jsonb;
begin
 if not exists(select 1 from public.implanta_projects where id=project) then return null; end if;
 flags:=coalesce(nullif(current_setting('implanta.acceptance_validated',true),'')::jsonb,'{}');
 if not flags ? project then
  value:=implanta_private.implantation_assembled(project);
  perform implanta_private.implantation_validate(value);
  if not exists(select 1 from public.implanta_implantation_records where project_id=project) or exists(select 1 from public.implanta_implantation_question_records q where q.project_id=project and not exists(select 1 from public.implanta_implantation_module_records m where m.project_id=project and m.id=q.data->>'entryId')) then raise exception 'Vínculo da homologação incompleto.'; end if;
  perform set_config('implanta.acceptance_validated',(flags || jsonb_build_object(project,true))::text,true);
 end if;
 if tg_argv[0]='implantation_term' and tg_op='INSERT' then
  if value is null then value:=implanta_private.implantation_assembled(project); end if;
  execute 'select data from public.implanta_municipality_records where project_id=$1' into project_data using project;
  perform implanta_private.implantation_verify_term(new.data,project_data,value);
 end if;
 return null;
end $$;
revoke all on function implanta_private.implantation_validation_dirty() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
