ALTER TABLE emails ADD COLUMN in_reply_to text;
COMMENT ON COLUMN emails.in_reply_to IS 'Gmail In-Reply-To header, links follow-up emails to original message';
