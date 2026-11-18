insert into public.automation_rules (organization_id, code, name, enabled, config)
select o.id, r.code, r.name, true, r.config
from public.organizations o
cross join (values
  ('NEW_CONTACT_TASK', 'Créer une tâche de premier contact', '{"delay_days":1}'::jsonb),
  ('STAGE_CHANGE_LOG', 'Tracer les changements d''étape',     '{}'::jsonb),
  ('STALE_DEAL_ALERT', 'Signaler une opportunité inactive',   '{"days":7}'::jsonb)
) as r(code, name, config)
on conflict (organization_id, code)
do update set name = excluded.name, config = excluded.config, enabled = true;

create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if org_name is null or char_length(trim(org_name)) = 0 or char_length(trim(org_name)) > 120 then
    raise exception 'Nom d''organisation invalide';
  end if;

  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.organizations (name) values (trim(org_name)) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role)
    values (new_org, auth.uid(), 'owner');

  insert into public.pipeline_stages (organization_id, name, position, probability) values
    (new_org, 'Nouveau',     1,  10), (new_org, 'Contacté',    2,  20),
    (new_org, 'Démo',        3,  40), (new_org, 'Proposition', 4,  60),
    (new_org, 'Négociation', 5,  80), (new_org, 'Gagné',       6, 100),
    (new_org, 'Perdu',       7,   0);

  insert into public.automation_rules (organization_id, code, name, enabled, config) values
    (new_org, 'NEW_CONTACT_TASK', 'Créer une tâche de premier contact', true, '{"delay_days":1}'),
    (new_org, 'STAGE_CHANGE_LOG', 'Tracer les changements d''étape',     true, '{}'),
    (new_org, 'STALE_DEAL_ALERT', 'Signaler une opportunité inactive',   true, '{"days":7}');

  return new_org;
end $$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

create or replace function public.automation_new_contact()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_run uuid;
  v_task uuid;
begin
  select * into v_rule from public.automation_rules
   where organization_id = new.organization_id and code = 'NEW_CONTACT_TASK' and enabled;
  if not found then return new; end if;

  insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
  values (new.organization_id, v_rule.id, 'contact:' || new.id || ':NEW_CONTACT_TASK', 'success',
          jsonb_build_object('contact_id', new.id))
  on conflict (organization_id, event_key) do nothing
  returning id into v_run;
  if v_run is null then return new; end if;

  begin
    insert into public.tasks (organization_id, title, due_at, priority, owner_id, contact_id)
    values (new.organization_id,
            'Premier contact — ' || new.first_name || ' ' || new.last_name,
            now() + make_interval(days => coalesce(nullif(v_rule.config ->> 'delay_days', '')::int, 1)),
            'normal', new.owner_id, new.id)
    returning id into v_task;
    update public.automation_runs
       set details = jsonb_build_object('contact_id', new.id, 'task_id', v_task) where id = v_run;
  exception when others then
    update public.automation_runs
       set status = 'failed', details = jsonb_build_object('contact_id', new.id, 'error', sqlerrm) where id = v_run;
  end;
  return new;
end $$;

drop trigger if exists contacts_automation on public.contacts;
create trigger contacts_automation
  after insert on public.contacts
  for each row execute function public.automation_new_contact();

create or replace function public.automation_stage_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_run uuid;
  v_stage text;
  v_actor uuid;
begin
  if new.stage_id is not distinct from old.stage_id then return new; end if;

  select * into v_rule from public.automation_rules
   where organization_id = new.organization_id and code = 'STAGE_CHANGE_LOG' and enabled;
  if not found then return new; end if;

  insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
  values (new.organization_id, v_rule.id, 'opp:' || new.id || ':stage:' || gen_random_uuid(), 'success',
          jsonb_build_object('opportunity_id', new.id))
  returning id into v_run;

  begin
    select name into v_stage from public.pipeline_stages where id = new.stage_id;
    select m.user_id into v_actor from public.organization_members m
     where m.organization_id = new.organization_id and m.user_id = auth.uid();
    insert into public.activities (organization_id, type, body, actor_id, opportunity_id)
    values (new.organization_id, 'stage_change',
            new.title || ' → ' || coalesce(v_stage, 'sans étape'), v_actor, new.id);
  exception when others then
    update public.automation_runs
       set status = 'failed', details = jsonb_build_object('opportunity_id', new.id, 'error', sqlerrm) where id = v_run;
  end;
  return new;
end $$;

drop trigger if exists opportunities_stage_automation on public.opportunities;
create trigger opportunities_stage_automation
  after update of stage_id on public.opportunities
  for each row execute function public.automation_stage_change();

create or replace function public.run_stale_deal_alerts()
returns integer language plpgsql security definer set search_path = public
as $$
declare
  r record;
  o record;
  v_days integer;
  v_run uuid;
  v_count integer := 0;
begin
  for r in select * from public.automation_rules where code = 'STALE_DEAL_ALERT' and enabled loop
    v_days := coalesce(nullif(r.config ->> 'days', '')::int, 7);
    for o in
      select op.* from public.opportunities op
       where op.organization_id = r.organization_id
         and op.closed_at is null
         and op.updated_at < now() - make_interval(days => v_days)
    loop
      v_run := null;
      insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
      values (r.organization_id, r.id,
              'stale:' || o.id || ':' || extract(epoch from o.updated_at)::bigint, 'success',
              jsonb_build_object('opportunity_id', o.id, 'days', v_days))
      on conflict (organization_id, event_key) do nothing
      returning id into v_run;
      if v_run is null then continue; end if;

      begin
        insert into public.tasks (organization_id, title, due_at, priority, owner_id, opportunity_id)
        values (o.organization_id,
                'Relancer : ' || o.title || ' (inactive depuis ' || v_days || ' jours)',
                now(), 'high', o.owner_id, o.id);
        v_count := v_count + 1;
      exception when others then
        update public.automation_runs
           set status = 'failed', details = details || jsonb_build_object('error', sqlerrm) where id = v_run;
      end;
    end loop;
  end loop;
  return v_count;
end $$;

revoke all on function public.automation_new_contact()   from public, anon, authenticated;
revoke all on function public.automation_stage_change()  from public, anon, authenticated;
revoke all on function public.run_stale_deal_alerts()    from public, anon, authenticated;