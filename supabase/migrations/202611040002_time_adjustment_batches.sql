-- Requer 202611040001_time_adjustments.sql. Aditivo: preserva todos os registros.
begin;
create or replace function public.implanta_time_adjustment_batch_save(p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; result jsonb := '[]';
begin
 perform pg_advisory_xact_lock(2026100901);
 if not implanta_private.enabled() then raise exception 'Entre em uma conta ativa.' using errcode='42501'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Lote de ajustes inválido.' using errcode='23514'; end if;
 if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'Informe entre 1 e 100 datas por salvamento.' using errcode='23514'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then raise exception 'Registros repetidos no lote.' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or item->>'id' is null
    or jsonb_typeof(item->'revision') is distinct from 'number'
    or item->>'revision' !~ '^[0-9]+$' then raise exception 'Registro de ponto inválido.' using errcode='23514'; end if;
  -- A função existente verifica proprietário, validação, versão e auditoria.
  -- Qualquer erro desfaz todo o lote, incluindo os registros de auditoria.
  result := result || jsonb_build_array(public.implanta_time_adjustment_save((item->>'id')::uuid,(item->>'revision')::integer,item->'data'));
 end loop;
 return result;
end $$;
revoke all on function public.implanta_time_adjustment_batch_save(jsonb) from public,anon,authenticated;
grant execute on function public.implanta_time_adjustment_batch_save(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
