-- Add processing_status to emails table
ALTER TABLE emails ADD COLUMN processing_status text DEFAULT 'pending';

-- Backfill: emails with a linked task → task_created
UPDATE emails SET processing_status = 'task_created'
WHERE processed = true AND id IN (SELECT email_id FROM tasks WHERE email_id IS NOT NULL);

-- Backfill: processed emails without a linked task → no_action_required
-- (we can't reliably know what happened, but "no action" is the safest default)
UPDATE emails SET processing_status = 'no_action_required'
WHERE processed = true AND processing_status = 'pending';

-- Unprocessed emails stay as 'pending' (the default)
