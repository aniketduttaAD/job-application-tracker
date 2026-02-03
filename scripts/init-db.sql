-- Run this in Neon SQL Editor (or psql) to create the jobs table.
-- Use DATABASE_URL or POSTGRES_URL from your Neon project.

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  company_publisher TEXT,
  location TEXT NOT NULL DEFAULT '',
  salary_min BIGINT,
  salary_max BIGINT,
  salary_currency TEXT,
  salary_period TEXT,
  tech_stack JSONB NOT NULL DEFAULT '[]',
  tech_stack_normalized JSONB,
  role TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT 'Not specified',
  job_type TEXT,
  availability TEXT,
  product TEXT,
  seniority TEXT,
  collaboration_tools JSONB,
  status TEXT NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL,
  posted_at TEXT,
  applicants_count INTEGER,
  education TEXT,
  source TEXT,
  jd_raw TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_applied_at ON jobs (applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);

CREATE TABLE IF NOT EXISTS telegram_sessions (
  chat_id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
