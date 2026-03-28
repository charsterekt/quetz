#!/usr/bin/env node

import { countOpenIssues } from './beads.js';
import { CLAUDE_EFFORT_LEVELS, DEFAULTS, isClaudeEffortLevel, loadConfig } from './config.js';
import { MOCK_ISSUES } from './mock-data.js';
import { AGENT_PROVIDERS, getProviderDescriptor, isAgentProvider, renderModelListing, type AgentProvider } from './provider.js';
import type { LaunchIssueCounts, LaunchSelection } from './ui/LaunchApp.js';

export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_PREFLIGHT_FAILURE = 3;

function getLaunchIssueCounts(): LaunchIssueCounts {
  try {
    return {
      live: countOpenIssues(),
      simulate: MOCK_ISSUES.filter(issue => issue.status === 'ready').length,
    };
  } catch {
    return {
      live: 0,
      simulate: MOCK_ISSUES.filter(issue => issue.status === 'ready').length,
    };
  }
}

function getLaunchDefaults(): LaunchSelection {
  let provider: AgentProvider = DEFAULTS.agent.provider;
  let model = DEFAULTS.agent.model ?? getProviderDescriptor(provider).defaultModel;
  let effort = DEFAULTS.agent.effort;

  try {
    const config = loadConfig();
    provider = config.agent.provider;

    const providerConfig = provider === 'claude'
      ? config.agent.providers.claude
      : config.agent.providers.codex;

    model = providerConfig.model ?? config.agent.model ?? getProviderDescriptor(provider).defaultModel;
    effort = providerConfig.effort ?? config.agent.effort;
  } catch {
    // Launch screen falls back to defaults when config is not ready yet.
  }

  return {
    provider,
    model,
    effort,
    simulate: false,
    localCommits: false,
    amend: false,
    customPrompt: undefined,
    beadsMode: 'all',
    epicId: undefined,
  };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--version' || command === '-v') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json');
    process.stdout.write(`quetz v${pkg.version}\n`);
    process.exit(EXIT_SUCCESS);
  }

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write('Usage: quetz <command> [options]\n\n');
    process.stdout.write('Commands:\n');
    process.stdout.write('  init                         Initialize quetz in this project\n');
    process.stdout.write('  run                          Start the dev loop\n');
    process.stdout.write('  run --local-commits          Commit locally instead of opening a PR\n');
    process.stdout.write('  run --amend                  Accumulate all work into one rolling commit\n');
    process.stdout.write('  run --simulate               Full visual test (mock issues + fake PR lifecycle)\n');
    process.stdout.write('  run --simulate --local-commits  Simulate with fake commits (no PRs)\n');
    process.stdout.write('  run --simulate --amend       Simulate with fake amend commits\n');
    process.stdout.write(`  run --provider <provider>    Select agent provider (${AGENT_PROVIDERS.join('|')})\n`);
    process.stdout.write('  run --model <model>          Override agent model (e.g. haiku, sonnet, opus)\n');
    process.stdout.write(`  run --effort <level>         Override agent effort (${CLAUDE_EFFORT_LEVELS.join('|')})\n`);
    process.stdout.write('  run --timeout <minutes>      Kill agent after this many minutes (default: 30)\n');
    process.stdout.write(`  models --provider <provider> List known model names for one provider (${AGENT_PROVIDERS.join('|')})\n`);
    process.stdout.write('  models                       List known model names for all providers\n');
    process.stdout.write('  status                       Show loop progress (issues ready/in-progress/done)\n');
    process.stdout.write('  validate                     Validate .quetzrc.yml\n');
    process.stdout.write('  config show                  Show resolved config with applied defaults\n');
    process.stdout.write('  version                      Show quetz version\n');
    process.stdout.write('\n');
    process.exit(EXIT_SUCCESS);
  }

  switch (command) {
    case 'version': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('../package.json');
      process.stdout.write(`quetz v${pkg.version}\n`);
      process.exit(EXIT_SUCCESS);
      break;
    }
    case 'init': {
      const { runInit } = await import('./init.js');
      await runInit();
      break;
    }
    case 'validate': {
      const { validateConfig } = await import('./config.js');
      try {
        validateConfig();
        process.stdout.write('Config is valid\n');
        process.exit(EXIT_SUCCESS);
      } catch (err) {
        const e = err as { message?: string };
        process.stderr.write(`Config error: ${e.message ?? String(err)}\n`);
        process.exit(EXIT_CONFIG_ERROR);
      }
      break;
    }
    case 'config': {
      const subcommand = args[1];
      if (subcommand === 'show') {
        const { showConfig } = await import('./config.js');
        showConfig();
        process.exit(EXIT_SUCCESS);
      } else {
        process.stderr.write('Unknown subcommand. Try: quetz config show\n');
        process.exit(EXIT_FAILURE);
      }
      break;
    }
    case 'models': {
      let provider: (typeof AGENT_PROVIDERS)[number] | undefined;
      const providerIdx = args.indexOf('--provider');
      if (providerIdx !== -1) {
        const value = args[providerIdx + 1];
        if (!value) {
          process.stderr.write(`Error: --provider requires a value (${AGENT_PROVIDERS.join(', ')}).\n`);
          process.exit(EXIT_FAILURE);
        }
        if (!isAgentProvider(value)) {
          process.stderr.write(`Error: invalid --provider "${value}". Use ${AGENT_PROVIDERS.join(', ')}.\n`);
          process.exit(EXIT_FAILURE);
        }
        provider = value;
      }

      process.stdout.write(renderModelListing(provider));
      process.exit(EXIT_SUCCESS);
      break;
    }
    case 'run': {
      let localCommits = args.includes('--local-commits');
      let amend = args.includes('--amend');
      let simulate = args.includes('--simulate');

      if (amend && localCommits) {
        process.stderr.write('Error: --amend and --local-commits are mutually exclusive. Use one or the other.\n');
        process.exit(EXIT_FAILURE);
      }

      let provider: (typeof AGENT_PROVIDERS)[number] | undefined;
      const providerIdx = args.indexOf('--provider');
      if (providerIdx !== -1) {
        const value = args[providerIdx + 1];
        if (!value) {
          process.stderr.write(`Error: --provider requires a value (${AGENT_PROVIDERS.join(', ')}).\n`);
          process.exit(EXIT_FAILURE);
        }
        if (!isAgentProvider(value)) {
          process.stderr.write(`Error: invalid --provider "${value}". Use ${AGENT_PROVIDERS.join(', ')}.\n`);
          process.exit(EXIT_FAILURE);
        }
        provider = value;
      }

      let model: string | undefined;
      const modelIdx = args.indexOf('--model');
      if (modelIdx !== -1 && modelIdx + 1 < args.length) {
        model = args[modelIdx + 1];
      }

      let effort: typeof CLAUDE_EFFORT_LEVELS[number] | undefined;
      const effortIdx = args.indexOf('--effort');
      const legacyEffortIdx = args.indexOf('--thinking-level');
      const selectedEffortIdx = effortIdx !== -1 ? effortIdx : legacyEffortIdx;
      if (selectedEffortIdx !== -1) {
        const value = args[selectedEffortIdx + 1];
        if (!value) {
          process.stderr.write(`Error: --effort requires a value (${CLAUDE_EFFORT_LEVELS.join(', ')}).\n`);
          process.exit(EXIT_FAILURE);
        }
        if (!isClaudeEffortLevel(value)) {
          process.stderr.write(`Error: invalid --effort "${value}". Use ${CLAUDE_EFFORT_LEVELS.join(', ')}.\n`);
          process.exit(EXIT_FAILURE);
        }
        effort = value;
      }

      let timeout: number | undefined;
      const timeoutIdx = args.indexOf('--timeout');
      if (timeoutIdx !== -1 && timeoutIdx + 1 < args.length) {
        const value = parseInt(args[timeoutIdx + 1], 10);
        if (!isNaN(value) && value > 0) timeout = value;
      }

      const { createBus } = await import('./events.js');
      const { runLoop } = await import('./loop.js');
      const { printLogo } = await import('./display/quetz.js');
      const bus = createBus();

      if (process.stdout.isTTY) {
        const { mountApp } = await import('./ui/App.js');

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../package.json');

        if (args.length === 1) {
          const { mountLaunchApp } = await import('./ui/LaunchApp.js');
          const launchApp = mountLaunchApp({
            version: pkg.version,
            initialSelection: getLaunchDefaults(),
            issueCounts: getLaunchIssueCounts(),
          });
          await launchApp.ready;

          const launchSelection = await launchApp.result;
          await launchApp.unmount();

          if (!launchSelection) {
            process.exit(EXIT_SUCCESS);
          }

          provider = launchSelection.provider;
          model = launchSelection.model;
          effort = launchSelection.effort;
          simulate = launchSelection.simulate;
          localCommits = launchSelection.localCommits;
          amend = launchSelection.amend;
        }

        let resolveQuit!: () => void;
        const quitPromise = new Promise<void>(resolve => {
          resolveQuit = resolve;
        });
        let resolveShutdown!: () => void;
        const shutdownPromise = new Promise<void>(resolve => {
          resolveShutdown = resolve;
        });

        const app = mountApp({ bus, version: pkg.version, onQuit: resolveQuit });
        await app.ready;

        let loopResult: import('./loop.js').LoopResult = { exitCode: 0, reason: 'victory' };
        let loopTerminalResult: import('./loop.js').LoopResult | null = null;

        const exitMessage = (result: import('./loop.js').LoopResult, interrupted: boolean): string => {
          if (interrupted) return 'The serpent withdraws — interrupted by user.\n';
          switch (result.reason) {
            case 'victory':
              return 'The serpent rests — all issues resolved. 🐉\n';
            case 'no_issues':
              return 'The serpent sleeps — no ready issues found.\n';
            case 'error':
              return `The serpent retreats (exit code ${result.exitCode} — runtime failure).\n`;
            default:
              return `Quetz stopped (exit code ${result.exitCode}).\n`;
          }
        };

        let cleaningUp = false;
        const cleanupTui = async (interrupted: boolean) => {
          if (cleaningUp) return;
          cleaningUp = true;
          await app.unmount();
          process.stdout.write('\x1b[2J\x1b[H\x1b[0m\x1b[?1049l\x1b[?25h');
          printLogo();
          const isInterrupted = interrupted && loopTerminalResult === null;
          process.stdout.write(`\n${exitMessage(loopResult, isInterrupted)}`);
          process.exit(loopResult.exitCode);
        };

        let sigintRequested = false;
        const onSigint = () => {
          sigintRequested = true;
          resolveShutdown();
        };
        process.once('SIGINT', onSigint);

        let userQuit = false;
        const exitSignal = new Promise<void>(resolve => {
          runLoop({ provider, model, effort, timeout, localCommits, amend, simulate }, bus)
            .then(result => {
              loopResult = result;
              loopTerminalResult = result;
              if (result.reason === 'no_issues') resolve();
            })
            .catch(() => {
              loopResult = { exitCode: 1, reason: 'error' };
              loopTerminalResult = loopResult;
              resolve();
            });
          quitPromise.then(() => {
            userQuit = true;
            resolveShutdown();
            resolve();
          });
        });

        await Promise.race([exitSignal, shutdownPromise]);
        process.off('SIGINT', onSigint);
        await cleanupTui(userQuit || sigintRequested);
      } else {
        const result = await runLoop({ provider, model, effort, timeout, localCommits, amend, simulate }, bus);
        process.exit(result.exitCode);
      }
      break;
    }
    case 'status': {
      const { showStatus } = await import('./loop.js');
      await showStatus();
      break;
    }
    default: {
      process.stderr.write(`Unknown command: ${command}\nRun "quetz help" for usage.\n`);
      process.exit(EXIT_FAILURE);
    }
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    const e = err as { exitCode?: number; message?: string };
    process.stderr.write(`\nError: ${e.message ?? String(err)}\n`);
    process.exit(e.exitCode ?? EXIT_FAILURE);
  });
}
