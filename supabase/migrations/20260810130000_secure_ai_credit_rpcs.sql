-- The AI credit RPCs validate identities against auth.users. They are exposed
-- only to the server-side service role, but SECURITY INVOKER still makes that
-- lookup depend on the caller's direct auth-schema privileges. Run the two
-- narrowly scoped RPCs as their trusted migration owner instead. Their
-- existing empty search_path remains unchanged.

alter function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  security definer;

alter function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint,
  uuid, uuid, text, text, bigint, bigint, bigint, text, text
)
  security definer;

-- ALTER FUNCTION preserves ACLs; reassert the intended boundary explicitly so
-- the migration remains safe even if privileges drifted before this hotfix.
revoke all on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  from public, anon, authenticated;
revoke all on function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint,
  uuid, uuid, text, text, bigint, bigint, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  to service_role;
grant execute on function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint,
  uuid, uuid, text, text, bigint, bigint, bigint, text, text
) to service_role;
