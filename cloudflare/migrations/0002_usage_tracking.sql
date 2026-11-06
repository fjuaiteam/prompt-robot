PRAGMA foreign_keys = ON;
CREATE TABLE usage_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0)
);
CREATE INDEX usage_sessions_account ON usage_sessions(account_id, started_at);
CREATE INDEX usage_sessions_activity ON usage_sessions(activity_id, started_at);
INSERT INTO usage_sessions(token_hash,account_id,activity_id,started_at,last_seen_at,expires_at)
SELECT s.token_hash,s.account_id,a.activity_id,CAST(strftime('%s','now') AS INTEGER)*1000,
  CAST(strftime('%s','now') AS INTEGER)*1000,s.expires_at
FROM sessions s JOIN accounts a ON a.id=s.account_id
WHERE s.role='student' AND s.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000;
