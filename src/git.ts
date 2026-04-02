import { execSync } from 'child_process';

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd, stdio: 'pipe' }).trim();
}

export function checkoutDefault(branch: string, cwd: string = process.cwd()): void {
  try {
    exec(`git checkout ${branch}`, cwd);
  } catch (err) {
    throw new Error(`git checkout ${branch} failed: ${(err as Error).message}`);
  }
}

export function pullDefault(branch: string, cwd: string = process.cwd()): void {
  try {
    exec(`git pull origin ${branch}`, cwd);
  } catch (err) {
    throw new Error(
      `git pull origin ${branch} failed (merge conflict or network error).\n` +
      `Resolve any conflicts and run quetz again.\n` +
      `Details: ${(err as Error).message}`
    );
  }
}

export function getRemoteUrl(cwd: string = process.cwd()): string {
  try {
    return exec('git remote get-url origin', cwd);
  } catch {
    throw new Error('No git remote "origin" found. Quetz needs a GitHub remote to poll PRs.');
  }
}

export function getDefaultBranch(cwd: string = process.cwd()): string {
  try {
    const ref = exec('git symbolic-ref refs/remotes/origin/HEAD', cwd);
    // e.g. refs/remotes/origin/main → main
    return ref.split('/').pop() ?? 'main';
  } catch {
    return 'main';
  }
}

/** Count commits on HEAD that are not on defaultBranch (i.e. new commits since checkout). */
export function countNewCommits(defaultBranch: string, cwd: string = process.cwd()): number {
  try {
    const out = exec(`git rev-list --count ${defaultBranch}..HEAD`, cwd);
    const n = parseInt(out, 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

/** Count commits ahead of defaultBranch (alias for countNewCommits, used by amend path). */
export function getCommitCountAhead(defaultBranch: string, cwd: string = process.cwd()): number {
  return countNewCommits(defaultBranch, cwd);
}

/** Get the current branch name. */
export function getCurrentBranch(cwd: string = process.cwd()): string {
  try {
    return exec('git rev-parse --abbrev-ref HEAD', cwd);
  } catch {
    return '';
  }
}

/** Delete a local branch (non-force). Returns true if deleted. */
export function deleteBranch(branch: string, cwd: string = process.cwd()): boolean {
  try {
    exec(`git branch -D ${branch}`, cwd);
    return true;
  } catch {
    return false;
  }
}

/** Parse "owner" and "repo" from a GitHub remote URL (HTTPS or SSH). */
export function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } {
  // HTTPS: https://github.com/owner/repo.git
  // SSH:   git@github.com:owner/repo.git
  const https = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!https) {
    throw new Error(`Cannot parse owner/repo from remote URL: ${remoteUrl}`);
  }
  return { owner: https[1], repo: https[2] };
}
