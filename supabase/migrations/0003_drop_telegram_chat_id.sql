-- ==========================================
-- Notifications are email only, so the unused Telegram chat id column goes.
-- Nothing ever wrote to it: no code path read it beyond parsing the row.
-- Idempotent, so it is safe to run against a populated database.
-- ==========================================

ALTER TABLE members
  DROP COLUMN IF EXISTS telegram_chat_id;
