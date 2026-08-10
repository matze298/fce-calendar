-- ==========================================
-- Access control: admin predicate, per-table policies, explicit grants,
-- the registration claim trigger, and the member read model.
-- ==========================================

-- A policy on members that selects from members raises
-- "infinite recursion detected in policy for relation members". SECURITY DEFINER runs as the
-- owner, so the read inside this function is not subject to RLS and nothing recurses.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
     WHERE auth_id = auth.uid()
       AND is_admin
       AND is_approved
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
