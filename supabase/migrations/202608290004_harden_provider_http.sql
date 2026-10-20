-- Provider calls are administrative only. Keep the HTTP extension unavailable
-- to browser-facing database roles while retaining access for the database owner.
revoke execute on function extensions.http(extensions.http_request) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_get(character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_get(character varying, jsonb) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_post(character varying, character varying, character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_post(character varying, jsonb) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_put(character varying, character varying, character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_delete(character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_delete(character varying, character varying, character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_head(character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_set_curlopt(character varying, character varying) from public, anon, authenticated, service_role;
revoke execute on function extensions.http_reset_curlopt() from public, anon, authenticated, service_role;
revoke execute on function extensions.http_list_curlopt() from public, anon, authenticated, service_role;
