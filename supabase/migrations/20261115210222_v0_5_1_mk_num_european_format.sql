create or replace function public._mk_num(p jsonb, k text)
returns numeric language plpgsql immutable set search_path = public
as $$
declare
  raw text := p ->> k;
  v text := nullif(regexp_replace(coalesce(p ->> k, ''), '[^0-9,.\-]', '', 'g'), '');
begin
  if v is null then return null; end if;
  if position(',' in v) > 0 and position('.' in v) > 0 then
    if strpos(reverse(v), ',') < strpos(reverse(v), '.') then
      v := replace(replace(v, '.', ''), ',', '.');
    else
      v := replace(v, ',', '');
    end if;
  elsif position(',' in v) > 0 then
    v := replace(v, ',', '.');
  end if;
  return v::numeric;
exception when others then
  raise exception 'Champ "%" : nombre invalide (%)', k, raw;
end $$;
revoke all on function public._mk_num(jsonb, text) from public, anon, authenticated;