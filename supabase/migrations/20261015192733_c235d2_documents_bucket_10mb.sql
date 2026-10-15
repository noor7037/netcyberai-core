-- C235-D2: the private `documents` bucket takes a file of up to 10 MB.
--
-- A paper on a staff or student record may be 10 MB (C235-D: record_document_versions.size_bytes checks
-- 1..10485760, and the app refuses more). The bucket was made with an 8 MiB limit
-- (20260921133000_documents_storage_bucket.sql), so a paper between 8 and 10 MB was refused by the store itself,
-- whether the server sent it or, now, the browser sends it straight to the store. Every other upload into this bucket
-- keeps its own, smaller limit in the app (the student capture 8 MB, homework, SQAAF evidence, ticket screenshots and
-- the school logo less). The four types the bucket takes do not change.
--
-- Data only (storage.buckets), no grant or policy. Raising only: a limit already at 10 MB or more is left as it is.
update storage.buckets
   set file_size_limit = 10485760
 where id = 'documents'
   and file_size_limit is not null
   and file_size_limit < 10485760;
