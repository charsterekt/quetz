import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { runPreflight } from './preflight.js';
import { writeConfig, DEFAULTS } from './config.js';
import type { QuetzConfig } from './config.js';

const AUTOMERGE_TEMPLATE_PATH = path.join(__dirname, 'templates', 'quetz-automerge.yml');

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function promptConfirm(
  rl: readline.Interface,
  label: string,
  defaultVal: string
): Promise<string> {
  const answer = await ask(rl, `  ${label} [${defaultVal}]: `);
  return answer.trim() || defaultVal;
}

async function gatherConfig(rl: readline.Interface): Promise<QuetzConfig> {
  let { owner, repo, defaultBranch } = (() => {
    try {
      const { owner: o, repo: r, defaultBranch: b } = runPreflight();
      return { owner: o, repo: r, defaultBranch: b };
    } catch {
      return { owner: '', repo: '', defaultBranch: 'main' };
    }
  })();

  process.stdout.write('\nConfig Setup\n════════════\n\n');

  owner = await promptConfirm(rl, 'GitHub owner/org', owner || 'owner');
  repo = await promptConfirm(rl, 'GitHub repo', repo || 'repo');
  defaultBranch = await promptConfirm(rl, 'Default branch', defaultBranch || 'main');
  const automergeLabel = await promptConfirm(rl, 'Automerge label', DEFAULTS.github.automergeLabel);

  return {
    ...DEFAULTS,
    github: { owner, repo, defaultBranch, automergeLabel },
  };
}

function getAutomergeYaml(automergeLabel: string): string {
  const template = fs.readFileSync(AUTOMERGE_TEMPLATE_PATH, 'utf-8');
  return template.replace('{{automergeLabel}}', automergeLabel);
}

async function setupGitHubActions(
  rl: readline.Interface,
  config: QuetzConfig,
  projectRoot: string
): Promise<void> {
  const yaml = getAutomergeYaml(config.github.automergeLabel);

  process.stdout.write('\nGitHub Actions Setup\n════════════════════\n\n');
  process.stdout.write(
    'Quetz needs one GitHub Action: an automerge workflow that merges PRs\n' +
    'when all checks pass and the "' + config.github.automergeLabel + '" label is present.\n\n' +
    '  [1] Write automerge workflow to .github/workflows/quetz-automerge.yml\n' +
    '  [2] Have Claude Code raise a PR to add it\n' +
    '  [3] I\'ll handle it myself (show me what\'s needed)\n\n'
  );

  const choice = await ask(rl, 'Select [1/2/3]: ');

  if (choice.trim() === '1') {
    const workflowDir = path.join(projectRoot, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'quetz-automerge.yml'), yaml, 'utf-8');
    process.stdout.write('\n  Wrote .github/workflows/quetz-automerge.yml\n');
  } else if (choice.trim() === '2') {
    const prompt =
      'Create the file .github/workflows/quetz-automerge.yml with the following content:\n\n' +
      yaml +
      '\n\nCommit it, push to a new branch, and open a pull request.';
    try {
      execSync(`claude -p ${JSON.stringify(prompt)} --dangerously-skip-permissions`, {
        stdio: 'inherit',
        cwd: projectRoot,
      });
    } catch {
      process.stderr.write('\nClaude Code session ended.\n');
    }
  } else {
    process.stdout.write('\nPaste this into .github/workflows/quetz-automerge.yml:\n\n');
    process.stdout.write(yaml + '\n');
  }
}

function printLabelReminder(config: QuetzConfig): void {
  process.stdout.write(
    `\n⚠  Reminder: Create the "${config.github.automergeLabel}" label on your GitHub repo.\n` +
    `   → https://github.com/${config.github.owner}/${config.github.repo}/labels\n` +
    '   Quetz agents will tag PRs with this label to trigger auto-merge.\n\n'
  );
}

export async function runInit(projectRoot: string = process.cwd()): Promise<void> {
  process.stdout.write('Running preflight checks...\n');
  runPreflight();
  process.stdout.write('  All checks passed.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const config = await gatherConfig(rl);
    writeConfig(config, projectRoot);
    process.stdout.write('\n  Wrote .quetzrc.yml\n');

    await setupGitHubActions(rl, config, projectRoot);
    printLabelReminder(config);

    process.stdout.write('quetz init complete. Run `quetz run` to start the loop.\n');
  } finally {
    rl.close();
  }
}
