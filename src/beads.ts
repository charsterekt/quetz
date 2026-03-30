import { execSync, execFileSync } from 'child_process';
import { MOCK_ISSUES } from './mock-data.js';

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

// ── Mock mode ────────────────────────────────────────────────────────────────

let mockMode = false;

export function enableMockMode(): void {
  mockMode = true;
}

export function disableMockMode(): void {
  mockMode = false;
}

// ── bd wrappers ───────────────────────────────────────────────────────────────

function execBd(args: string[]): string {
  try {
    return execFileSync('bd', args, { encoding: 'utf-8' });
  } catch (err) {
    const msg = (err as { stderr?: string; message?: string }).stderr
      ?? (err as Error).message
      ?? String(err);
    throw new Error(`bd command failed: bd ${args.join(' ')}\n${msg}`);
  }
}

function execBdJson(args: string[]): unknown {
  return JSON.parse(execBd([...args, '--json']));
}

export function getReadyIssues(): BeadsIssue[] {
  if (mockMode) return MOCK_ISSUES.filter(i => i.status === 'ready');
  const parsed = execBdJson(['ready']);
  if (!Array.isArray(parsed)) return [];
  return parsed as BeadsIssue[];
}

export function listAllIssues(): BeadsIssue[] {
  if (mockMode) return MOCK_ISSUES;
  try {
    const parsed = execBdJson(['list', '--flat']);
    return Array.isArray(parsed) ? (parsed as BeadsIssue[]) : [];
  } catch {
    return [];
  }
}

export function countOpenIssues(): number {
  if (mockMode) return MOCK_ISSUES.filter(issue => issue.status === 'ready').length;
  try {
    const parsed = execBdJson(['count', '--status', 'open']) as { count?: unknown };
    return typeof parsed?.count === 'number' ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export function getIssueDetails(id: string): BeadsIssue {
  // Validate issue ID to prevent command injection (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid issue ID format: ${id}`);
  }
  if (mockMode) {
    const issue = MOCK_ISSUES.find(i => i.id === id);
    if (!issue) throw new Error(`Mock issue not found: ${id}`);
    return issue;
  }
  try {
    const parsed = execBdJson(['show', id]);
    const issue = Array.isArray(parsed) ? parsed[0] : parsed;
    return issue as BeadsIssue;
  } catch (err) {
    const msg = (err as { stderr?: string; message?: string }).stderr
      ?? (err as Error).message
      ?? String(err);
    throw new Error(`bd command failed: bd show ${id} --json\n${msg}`);
  }
}

export function getPrimeContext(): string {
  try {
    return execSync('bd prime', { encoding: 'utf-8' });
  } catch {
    // bd prime is optional — if it fails, return empty string
    return '';
  }
}
