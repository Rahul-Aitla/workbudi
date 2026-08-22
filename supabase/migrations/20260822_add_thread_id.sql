ALTER TABLE emails ADD COLUMN thread_id text;
COMMENT ON COLUMN emails.thread_id IS 'Gmail threadId, groups all emails in same conversation';
