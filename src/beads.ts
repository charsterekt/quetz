import { execSync } from 'child_process';

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  owner?: string;
  assignee?: string;
  created_at: string;
  updated_at: string;
  dependencies?: BeadsDependency[];
  dependency_count?: number;
  dependent_count?: number;
}

export interface BeadsDependency {
  issue_id: string;
  depends_on_id: string;
  type: string;
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8' });
  } catch (err) {
    const msg = (err as { stderr?: string; message?: string }).stderr
      ?? (err as Error).message
      ?? String(err);
    throw new Error(`bd command failed: ${cmd}\n${msg}`);
  }
}

export function getReadyIssues(): BeadsIssue[] {
  const output = exec('bd ready --json');
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) return [];
  return parsed as BeadsIssue[];
}

export function getIssueDetails(id: string): BeadsIssue {
  const output = exec(`bd show ${id} --json`);
  return JSON.parse(output) as BeadsIssue;
}

export function getPrimeContext(): string {
  try {
    return execSync('bd prime', { encoding: 'utf-8' });
  } catch {
    // bd prime is optional — if it fails, return empty string
    return '';
  }
}
