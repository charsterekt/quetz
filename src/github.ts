import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import type { QuetzConfig } from './config.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged: boolean;
  head: { ref: string };
  body: string | null;
  created_at: string;
}

export type MergeStatus = 'merged' | 'closed' | 'ci_failed' | 'timeout';

export interface MergeResult {
  status: MergeStatus;
  pr: PR;
  details?: string;
}

// ── Octokit factory ────────────────────────────────────────────────────────

export function createOctokit(): Octokit {
  // Prefer GITHUB_TOKEN env var; fall back to `gh auth token`
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
    } catch {
      throw new Error(
        'No GitHub token found. Set GITHUB_TOKEN or run `gh auth login`.'
      );
    }
  }
  return new Octokit({ auth: token });
}

// ── PR Detection ───────────────────────────────────────────────────────────

/**
 * Search recent open PRs for one referencing the given issueId, created after
 * spawnTime. Retries every retryIntervalMs until prDetectionTimeout seconds
 * have elapsed.
 *
 * Returns the matched PR or null on timeout.
 */
export async function findPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueId: string,
  spawnTime: Date,
  prDetectionTimeoutSec: number = 60,
  retryIntervalMs: number = 5000
): Promise<PR | null> {
  const deadline = spawnTime.getTime() + prDetectionTimeoutSec * 1000;

  while (Date.now() < deadline) {
    const pr = await queryForPR(octokit, owner, repo, issueId, spawnTime);
    if (pr) return pr;
    await delay(retryIntervalMs);
  }

  // Final attempt at deadline
  return queryForPR(octokit, owner, repo, issueId, spawnTime);
}

async function queryForPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueId: string,
  spawnTime: Date
): Promise<PR | null> {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state: 'open',
    sort: 'created',
    direction: 'desc',
    per_page: 10,
  });

  for (const pr of data) {
    const createdAfterSpawn = new Date(pr.created_at) >= spawnTime;
    const referencesIssue =
      pr.title.includes(issueId) ||
      (pr.body ?? '').includes(issueId) ||
      pr.head.ref.includes(issueId);

    if (createdAfterSpawn && referencesIssue) {
      return {
        number: pr.number,
        title: pr.title,
        html_url: pr.html_url,
        state: pr.state,
        merged: pr.merged_at != null,
        head: { ref: pr.head.ref },
        body: pr.body ?? null,
        created_at: pr.created_at,
      };
    }
  }

  return null;
}

// ── Merge Polling ──────────────────────────────────────────────────────────

/**
 * Poll a PR until it merges, closes, CI fails, or the merge timeout elapses.
 *
 * Poll interval and timeout come from config.poll.
 */
export async function pollForMerge(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  config: QuetzConfig,
  onPoll?: (elapsed: string) => void
): Promise<MergeResult> {
  const intervalMs = config.poll.interval * 1000;
  const timeoutMs = config.poll.mergeTimeout * 60 * 1000;
  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;

    if (elapsed >= timeoutMs) {
      const pr = await getPR(octokit, owner, repo, prNumber);
      return { status: 'timeout', pr };
    }

    const pr = await getPR(octokit, owner, repo, prNumber);

    if (pr.merged) {
      return { status: 'merged', pr };
    }

    if (pr.state === 'closed') {
      return { status: 'closed', pr };
    }

    // Check for CI failures on this PR's head commit
    const ciFailure = await checkCIStatus(octokit, owner, repo, pr.head.ref);
    if (ciFailure) {
      return { status: 'ci_failed', pr, details: ciFailure };
    }

    if (onPoll) {
      onPoll(formatElapsed(elapsed));
    }

    await delay(intervalMs);
  }
}

async function getPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PR> {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  return {
    number: data.number,
    title: data.title,
    html_url: data.html_url,
    state: data.state,
    merged: data.merged ?? false,
    head: { ref: data.head.ref },
    body: data.body ?? null,
    created_at: data.created_at,
  };
}

/**
 * Returns a failure description string if any check run has failed,
 * or null if all checks are passing/pending.
 */
async function checkCIStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.checks.listForRef({
      owner,
      repo,
      ref,
      per_page: 50,
    });

    for (const run of data.check_runs) {
      if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
        return `Check "${run.name}" failed (${run.conclusion}). See: ${run.html_url}`;
      }
    }
  } catch {
    // If the checks API is unavailable, don't fail the poll
  }

  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
