CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  issue_url TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  issue_title TEXT,
  issue_body TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open/claimed/submitted/merged/closed
  claimed_by TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  patch TEXT NOT NULL,
  pr_url TEXT,
  pr_status TEXT NOT NULL DEFAULT 'pending',  -- pending/merged/closed
  model_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
