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
  salary_estimated BOOLEAN DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL CHECK (session_type IN ('browser', 'telegram')),
  identifier TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_type, identifier)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_type_identifier ON user_sessions (session_type, identifier);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at <= NOW();
END;
$$;