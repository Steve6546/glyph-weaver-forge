REVOKE ALL ON FUNCTION public.purge_expired_agent_memory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_agent_memory() TO service_role;