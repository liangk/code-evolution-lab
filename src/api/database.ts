import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'code_evolution_lab',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export class DatabaseService {
  async query(text: string, params?: any[]): Promise<QueryResult> {
    const client = await pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async createRepository(githubUrl: string, name: string, ownerId: string) {
    const query = `
      INSERT INTO repositories (id, github_url, name, owner_id, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
      RETURNING *
    `;
    const result = await this.query(query, [githubUrl, name, ownerId]);
    return result.rows[0];
  }

  async getRepository(id: string) {
    const query = 'SELECT * FROM repositories WHERE id = $1';
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async createAnalysis(repositoryId: string, score: number, issuesCounts: any) {
    const query = `
      INSERT INTO analyses (id, repository_id, score, total_issues, critical_issues, high_issues, medium_issues, analyzed_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    const result = await this.query(query, [
      repositoryId,
      score,
      issuesCounts.total,
      issuesCounts.critical,
      issuesCounts.high,
      issuesCounts.medium,
    ]);
    return result.rows[0];
  }

  async getAnalysis(id: string) {
    const query = 'SELECT * FROM analyses WHERE id = $1';
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async getAnalysesByRepository(repositoryId: string) {
    const query = 'SELECT * FROM analyses WHERE repository_id = $1 ORDER BY analyzed_at DESC';
    const result = await this.query(query, [repositoryId]);
    return result.rows;
  }

  async createIssue(analysisId: string, issue: any) {
    const query = `
      INSERT INTO issues (
        id, analysis_id, type, severity, file_path, line_number,
        title, description, code_before, code_after, estimated_impact, created_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `;
    const result = await this.query(query, [
      analysisId,
      issue.type,
      issue.severity,
      issue.filePath,
      issue.lineNumber,
      issue.title,
      issue.description,
      issue.codeBefore,
      issue.codeAfter,
      JSON.stringify(issue.estimatedImpact),
    ]);
    return result.rows[0];
  }

  async getIssuesByAnalysis(analysisId: string) {
    const query = 'SELECT * FROM issues WHERE analysis_id = $1 ORDER BY severity DESC, line_number ASC';
    const result = await this.query(query, [analysisId]);
    return result.rows;
  }

  async createSolution(issueId: string, solution: any) {
    const query = `
      INSERT INTO solutions (
        id, issue_id, type, description, code_after, explanation,
        estimated_impact, difficulty, fitness_score, rank, created_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;
    const result = await this.query(query, [
      issueId,
      solution.type,
      solution.description,
      solution.codeAfter,
      solution.explanation,
      solution.estimatedImpact,
      solution.difficulty,
      solution.fitnessScore,
      solution.rank,
    ]);
    return result.rows[0];
  }

  async getSolutionsByIssue(issueId: string) {
    const query = 'SELECT * FROM solutions WHERE issue_id = $1 ORDER BY rank ASC';
    const result = await this.query(query, [issueId]);
    return result.rows;
  }
}

export const db = new DatabaseService();
