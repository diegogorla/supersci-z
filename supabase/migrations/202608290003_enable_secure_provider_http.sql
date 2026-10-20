-- Enables server-side provider checks from Postgres. The extension lives outside
-- exposed schemas; no browser role receives direct access to Vault secrets.
create extension if not exists http with schema extensions;
