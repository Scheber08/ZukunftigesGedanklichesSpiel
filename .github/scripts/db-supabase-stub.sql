-- =============================================================================
-- CI: Minimal-Nachbildung einer Supabase-Datenbank in einem nackten Postgres-Container,
-- damit die Migrationen unverändert laufen (Rollen, Standardrechte, storage.buckets).
-- Nur für .github/workflows/ci.yml – NICHT in Supabase ausführen.
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- Supabase vergibt auf public standardmäßig alle Rechte an die API-Rollen;
-- die RLS-Migration entzieht anon/authenticated danach das Schreiben wieder.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;
create table storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
