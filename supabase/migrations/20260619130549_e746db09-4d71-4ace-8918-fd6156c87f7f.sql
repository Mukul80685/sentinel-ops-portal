
CREATE POLICY "ssacc read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ssacc-files');
CREATE POLICY "ssacc insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ssacc-files' AND public.can_edit(auth.uid()));
CREATE POLICY "ssacc update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ssacc-files' AND public.can_edit(auth.uid()));
CREATE POLICY "ssacc delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ssacc-files' AND public.can_edit(auth.uid()));
