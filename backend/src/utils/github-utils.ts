import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import https from 'https';

const execAsync = promisify(exec);

export interface CloneResult {
  success: boolean;
  localPath: string;
  error?: string;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  content: string;
}

/**
 * Determine if a GitHub repository is private using the GitHub REST API.
 * Falls back to public if the request fails.
 */
export async function getRepoVisibility(githubUrl: string): Promise<boolean> {
  try {
    const parts = githubUrl.replace(/\.git$/, '').split('/').filter(Boolean);
    const owner = parts[parts.length - 2];
    const repo = parts[parts.length - 1];

    if (!owner || !repo) {
      console.warn(`Unable to parse owner/repo from URL: ${githubUrl}`);
      return false;
    }

    const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}`,
      method: 'GET',
      headers: {
        'User-Agent': 'code-evolution-lab',
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const response = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    if (response.status === 200 && typeof response.body?.private === 'boolean') {
      return Boolean(response.body.private);
    }

    if (response.status === 404) {
      console.warn(`GitHub visibility lookup returned 404 for ${owner}/${repo}. Assuming private.`);
      return true;
    }

    console.warn(`GitHub visibility lookup failed (status ${response.status}). Defaulting to public.`);
    return false;
  } catch (error) {
    console.error('Error determining repository visibility:', error);
    return false;
  }
}

/**
 * Clone a GitHub repository to a temporary directory
 */
export async function cloneRepository(githubUrl: string, tokenOverride?: string): Promise<CloneResult> {
  try {
    // Create temp directory for cloned repos
    const tempDir = path.join(process.cwd(), 'temp', 'repos');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Extract repo name from URL
    const repoName = githubUrl.split('/').pop()?.replace('.git', '') || 'repo';
    const timestamp = Date.now();
    const localPath = path.join(tempDir, `${repoName}-${timestamp}`);

    // Support private repos via token when provided
    const token = tokenOverride || process.env.GITHUB_TOKEN || process.env.GH_PAT;
    const authedUrl = token
      ? githubUrl.replace('https://', `https://x-access-token:${token}@`)
      : githubUrl;

    // Clone the repository
    console.log(`Cloning ${githubUrl} to ${localPath}...`);
    await execAsync(`git clone --depth 1 ${authedUrl} "${localPath}"`);

    return {
      success: true,
      localPath
    };
  } catch (error) {
    console.error('Clone error:', error);
    return {
      success: false,
      localPath: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Find all JavaScript/TypeScript files in a directory recursively
 */
export async function findCodeFiles(directory: string): Promise<string[]> {
  try {
    const patterns = [
      '**/*.js',
      '**/*.ts',
      '**/*.jsx',
      '**/*.tsx'
    ];

    const ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.test.js',
      '**/*.test.ts',
      '**/*.spec.js',
      '**/*.spec.ts'
    ];

    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: directory,
        absolute: true,
        ignore: ignorePatterns,
        nodir: true
      });
      files.push(...matches);
    }

    // Remove duplicates
    return [...new Set(files)];
  } catch (error) {
    console.error('Error finding code files:', error);
    return [];
  }
}

/**
 * Read file content
 */
export function readFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return '';
  }
}

/**
 * Read all code files from a directory
 */
export async function readCodeFiles(directory: string): Promise<FileInfo[]> {
  const files = await findCodeFiles(directory);
  const fileInfos: FileInfo[] = [];

  for (const filePath of files) {
    const content = readFileContent(filePath);
    if (content) {
      const relativePath = path.relative(directory, filePath);
      fileInfos.push({
        path: filePath,
        relativePath,
        content
      });
    }
  }

  return fileInfos;
}

/**
 * Clean up cloned repository
 */
export function cleanupRepository(localPath: string): void {
  try {
    if (fs.existsSync(localPath)) {
      // On Windows, we need to remove read-only attributes from .git files
      if (process.platform === 'win32') {
        try {
          // Use child_process to run rmdir command on Windows
          const { execSync } = require('child_process');
          execSync(`rmdir /s /q "${localPath}"`, { stdio: 'ignore' });
          console.log(`Cleaned up ${localPath}`);
        } catch (cmdError) {
          // Fallback to fs.rmSync with maxRetries
          fs.rmSync(localPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          console.log(`Cleaned up ${localPath}`);
        }
      } else {
        fs.rmSync(localPath, { recursive: true, force: true });
        console.log(`Cleaned up ${localPath}`);
      }
    }
  } catch (error) {
    console.error(`Error cleaning up ${localPath}:`, error);
    // Don't throw - cleanup failure shouldn't break the analysis
  }
}
