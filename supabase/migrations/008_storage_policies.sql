-- 008_storage_policies
-- Close storage RLS gaps: receipts bucket had no policies; documents lacked admin read.

-- RECEIPTS bucket (private) — admins manage all, users upload/view own
DROP POLICY IF EXISTS "Admins manage receipts" ON storage.objects;
CREATE POLICY "Admins manage receipts"
  ON storage.objects FOR ALL
  USING (bucket_id = 'receipts' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "Users upload own receipts" ON storage.objects;
CREATE POLICY "Users upload own receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users view own receipts" ON storage.objects;
CREATE POLICY "Users view own receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND owner_id::uuid = auth.uid());

-- DOCUMENTS bucket (private) — add admin read (admins previously could not read user docs)
DROP POLICY IF EXISTS "Admins view documents" ON storage.objects;
CREATE POLICY "Admins view documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));