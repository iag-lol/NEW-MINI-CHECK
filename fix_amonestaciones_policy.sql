-- FIX RLS POLICY FOR Amonestaciones (Allow Public Access)

-- 1. Drop existing restricted policy
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.amonestaciones;

-- 2. Create new permissive policy for public (anon + authenticated)
CREATE POLICY "Enable all access for public" ON public.amonestaciones
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- 3. Ensure permissions are granted
GRANT ALL ON public.amonestaciones TO anon;
GRANT ALL ON public.amonestaciones TO authenticated;
GRANT ALL ON public.amonestaciones TO service_role;
