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

export type BeadsScope =
  | { mode: 'all' }
  | { mode: 'epic'; epicId: string };

export interface BeadsCycle {
  issues?: string[];
}

export interface BeadsValidationResult {
  errors: string[];
  warnings: string[];
  info: string[];
}

export interface BeadsScopeSummary {
  done: number;
  active: number;
  ready: number;
  blocked: number;
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

function formatBdCommand(args: string[]): string {
  return `bd ${args.join(' ')}`;
}

function execBd(args: string[]): string {
  try {
    return execFileSync('bd', args, { encoding: 'utf-8' });
  } catch (err) {
    const msg = (err as { stderr?: string; message?: string }).stderr
      ?? (err as Error).message
      ?? String(err);
    throw new Error(`bd command failed: ${formatBdCommand(args)}\n${msg}`);
  }
}

function execBdCommand(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8' });
  } catch (err) {
    const msg = (err as { stderr?: string; message?: string }).stderr
      ?? (err as Error).message
      ?? String(err);
    throw new Error(`bd command failed: ${command}\n${msg}`);
  }
}

function execBdJson(args: string[]): unknown {
  const commandArgs = [...args, '--json'];
  const raw = execBd(commandArgs);
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    throw new Error(`bd command failed: ${formatBdCommand(commandArgs)}\n${msg}`);
  }
}

function isOpenStatus(status: string | undefined): boolean {
  return status === 'open'
    || status === 'ready'
    || status === 'in_progress'
    || status === 'active';
}

function readyArgs(scope: BeadsScope): string[] {
  return scope.mode === 'epic'
    ? ['ready', '--parent', scope.epicId]
    : ['ready'];
}

function listArgs(scope: BeadsScope): string[] {
  return scope.mode === 'epic'
    ? ['list', '--parent', scope.epicId, '--all', '--flat']
    : ['list', '--all', '--flat'];
}

export function parseSwarmValidateOutput(output: string): BeadsValidationResult {
  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return {
    errors: lines.filter(line => /^error(?::|\s)/i.test(line)),
    warnings: lines.filter(line => /^warning(?::|\s)/i.test(line)),
    info: lines.filter(line => !/^error(?::|\s)/i.test(line) && !/^warning(?::|\s)/i.test(line)),
  };
}

export function getReadyIssues(scope: BeadsScope = { mode: 'all' }): BeadsIssue[] {
  if (mockMode) return MOCK_ISSUES.filter(i => i.status === 'ready');
  const parsed = execBdJson(readyArgs(scope));
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

export function listScopedIssues(scope: BeadsScope = { mode: 'all' }): BeadsIssue[] {
  if (mockMode) return MOCK_ISSUES;
  const parsed = execBdJson(listArgs(scope));
  return Array.isArray(parsed) ? (parsed as BeadsIssue[]).filter(Boolean) : [];
}

export function countOpenIssues(scope: BeadsScope = { mode: 'all' }): number {
  if (mockMode) return MOCK_ISSUES.filter(issue => isOpenStatus(issue.status)).length;
  return listScopedIssues(scope).filter(issue => isOpenStatus(issue.status)).length;
}

export function getDependencyCycles(): BeadsCycle[] {
  if (mockMode) return [];
  const parsed = execBdJson(['dep', 'cycles']);
  return Array.isArray(parsed) ? (parsed as BeadsCycle[]) : [];
}

export function assertEpicIssue(issue: BeadsIssue, epicId: string): void {
  if (issue.issue_type !== 'epic') {
    throw new Error(`bd show ${epicId} --json did not return an epic issue (got ${issue.issue_type})`);
  }
}

export function validateEpicGraph(epicId: string): BeadsValidationResult {
  if (mockMode) return { errors: [], warnings: [], info: [] };
  const output = execBdCommand(`bd swarm validate ${epicId}`);
  const parsed = parseSwarmValidateOutput(output);
  if (parsed.errors.length === 0 && parsed.warnings.length === 0 && parsed.info.length === 0) {
    throw new Error(`bd command failed: bd swarm validate ${epicId}\nEmpty validation output`);
  }
  return parsed;
}

export function getEpicScopeSummary(epicId: string): BeadsScopeSummary {
  if (mockMode) return { done: 0, active: 0, ready: 0, blocked: 0 };
  const parsed = execBdJson(['swarm', 'status', epicId]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { done: 0, active: 0, ready: 0, blocked: 0 };
  }
  const obj = parsed as Record<string, unknown>;
  return {
    done: typeof obj.completed === 'number'
      ? obj.completed
      : typeof obj.done === 'number'
        ? obj.done
        : 0,
    active: typeof obj.active === 'number' ? obj.active : 0,
    ready: typeof obj.ready === 'number' ? obj.ready : 0,
    blocked: typeof obj.blocked === 'number' ? obj.blocked : 0,
  };
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
