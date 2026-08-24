-- Add columns to track previous values when a follow-up email updates a task
ALTER TABLE tasks ADD COLUMN previous_deadline text;
ALTER TABLE tasks ADD COLUMN previous_priority integer;
