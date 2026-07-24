
create policy "own docs read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "own docs insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "own docs update"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "own docs delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (auth.uid())::text = (storage.foldername(name))[1]);
