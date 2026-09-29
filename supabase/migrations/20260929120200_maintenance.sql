-- =============================================================================
-- Wartung: Löschfristen (Plan §6.7) und Keep-alive
-- Wird vom täglichen Cron-Job des Workers per RPC aufgerufen.
-- =============================================================================

create or replace function public.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_registrations integer;
  cleared_registration_ips integer;
  cleared_incident_ips integer;
  cleared_contact_ips integer;
  deleted_rate_events integer;
  cleared_incident_contacts integer;
begin
  -- abgelehnte Anmeldungen: nach 6 Monaten löschen
  delete from registrations
  where status = 'rejected' and coalesce(processed_at, created_at) < now() - interval '6 months';
  get diagnostics deleted_registrations = row_count;

  -- ip_hash: nach 30 Tagen löschen
  update registrations set ip_hash = null where ip_hash is not null and created_at < now() - interval '30 days';
  get diagnostics cleared_registration_ips = row_count;

  update incidents set ip_hash = null where ip_hash is not null and created_at < now() - interval '30 days';
  get diagnostics cleared_incident_ips = row_count;

  update contact_messages set ip_hash = null where ip_hash is not null and created_at < now() - interval '30 days';
  get diagnostics cleared_contact_ips = row_count;

  delete from rate_limit_events where created_at < now() - interval '30 days';
  get diagnostics deleted_rate_events = row_count;

  -- Kontaktdaten aus Vorfällen: nach Saisonende löschen
  update incidents i
  set reporter_contact = null
  from rounds r
  join seasons s on s.id = r.season_id
  where i.round_id = r.id and s.status = 'finished' and i.reporter_contact is not null;
  get diagnostics cleared_incident_contacts = row_count;

  return jsonb_build_object(
    'deleted_registrations', deleted_registrations,
    'cleared_registration_ips', cleared_registration_ips,
    'cleared_incident_ips', cleared_incident_ips,
    'cleared_contact_ips', cleared_contact_ips,
    'deleted_rate_events', deleted_rate_events,
    'cleared_incident_contacts', cleared_incident_contacts
  );
end;
$$;

revoke all on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;
