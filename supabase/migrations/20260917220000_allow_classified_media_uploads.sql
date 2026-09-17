-- Sellers upload staged classified photos under their own user-id folder.
-- Public reads remain controlled by the approval policy in the preceding
-- secure-media migration.

DROP POLICY IF EXISTS "Authenticated sellers upload classified evidence" ON storage.objects;
CREATE POLICY "Authenticated sellers upload classified evidence"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ask-evidence'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated sellers upload classified listing media" ON storage.objects;
CREATE POLICY "Authenticated sellers upload classified listing media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'listing-media'
  AND split_part(name, '/', 1) = auth.uid()::text
);
