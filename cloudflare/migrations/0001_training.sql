PRAGMA foreign_keys = ON;
CREATE TABLE activities (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  is_open INTEGER NOT NULL DEFAULT 0 CHECK(is_open IN (0,1)), created_at TEXT NOT NULL
);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id),
  username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', group_name TEXT NOT NULL DEFAULT '',
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)), created_at TEXT NOT NULL
);
CREATE INDEX accounts_activity ON accounts(activity_id);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('student','admin')), expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id),
  account_id TEXT NOT NULL REFERENCES accounts(id), version INTEGER NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0 AND size <= 1000000), digest TEXT NOT NULL,
  request_id TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(activity_id,account_id)
);
CREATE INDEX submissions_activity ON submissions(activity_id);
CREATE TABLE images (submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE, data BLOB NOT NULL);
CREATE TRIGGER capacity_insert BEFORE INSERT ON submissions
WHEN NEW.size + COALESCE((SELECT SUM(size) FROM submissions WHERE account_id <> NEW.account_id OR activity_id <> NEW.activity_id),0) > 200000000
BEGIN SELECT RAISE(ABORT,'STORAGE_CAPACITY'); END;
CREATE TRIGGER capacity_update BEFORE UPDATE OF size ON submissions
WHEN NEW.size + COALESCE((SELECT SUM(size) FROM submissions WHERE id <> OLD.id),0) > 200000000
BEGIN SELECT RAISE(ABORT,'STORAGE_CAPACITY'); END;
INSERT INTO activities VALUES('training-20261118','2026/11/18 教育訓練','TRAIN1118',0,'2026-11-06T00:00:00.000Z');
