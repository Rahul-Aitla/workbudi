ALTER TABLE emails ADD COLUMN clarification_question text;

-- Backfill: set clarification_question for emails that already have needs_clarification status
-- The question is derived from the email snippet as a fallback
UPDATE emails
SET clarification_question = 'This email may need more context. Please review and provide details.'
WHERE processing_status = 'needs_clarification'
  AND clarification_question IS NULL;
