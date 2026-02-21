CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_url TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  last_analyzed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  score INTEGER,
  total_issues INTEGER,
  critical_issues INTEGER,
  high_issues INTEGER,
  medium_issues INTEGER,
  low_issues INTEGER,
  analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  file_path TEXT NOT NULL,
  line_number INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  code_before TEXT,
  code_after TEXT,
  estimated_impact JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  rank INTEGER,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  fitness_score REAL,
  reasoning TEXT,
  implementation_time INTEGER,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_repositories_owner ON repositories(owner_id);
CREATE INDEX idx_analyses_repository ON analyses(repository_id);
CREATE INDEX idx_issues_analysis ON issues(analysis_id);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_solutions_issue ON solutions(issue_id);
CREATE INDEX idx_solutions_fitness ON solutions(fitness_score DESC);
