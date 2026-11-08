-- Souls Register — central dump (Cloudflare D1)
-- Run once in Cloudflare dashboard → Storage & D1 → Create database → Console:
--   paste this file, Run.
CREATE TABLE IF NOT EXISTS souls (
  id             TEXT PRIMARY KEY,
  first_name     TEXT DEFAULT '',
  middle_name    TEXT DEFAULT '',
  surname        TEXT DEFAULT '',
  phone          TEXT DEFAULT '',
  gender         TEXT DEFAULT '',
  age_group      TEXT DEFAULT '',
  decision       TEXT DEFAULT '',
  address        TEXT DEFAULT '',
  prayer_request TEXT DEFAULT '',
  counsellor     TEXT DEFAULT '',
  device_id      TEXT DEFAULT '',
  created_at     TEXT DEFAULT '',
  updated_at     TEXT DEFAULT '',
  synced_by      TEXT DEFAULT '',
  server_time    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_souls_phone ON souls(phone);
CREATE INDEX IF NOT EXISTS idx_souls_counsellor ON souls(counsellor);
CREATE INDEX IF NOT EXISTS idx_souls_server_time ON souls(server_time);
