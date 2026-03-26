#!/usr/bin/env node

import { CLAUDE_THINKING_LEVELS, isClaudeThinkingLevel } from './config.js';

// Exit codes per spec section 7.4
export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_PREFLIGHT_FAILURE = 3;

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle global flags
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
    process.stdout.write('  run --model <model>          Override agent model (e.g. haiku, sonnet, opus)\n');
    process.stdout.write(`  run --thinking-level <level> Override Claude effort (${CLAUDE_THINKING_LEVELS.join('|')})\n`);
    process.stdout.write('  run --timeout <minutes>      Kill agent after this many minutes (default: 30)\n');
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
        process.stdout.write('✓ Config is valid\n');
        process.exit(EXIT_SUCCESS);
      } catch (err) {
        const e = err as { message?: string };
        process.stderr.write(`✗ Config error: ${e.message ?? String(err)}\n`);
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
    case 'run': {
      const localCommits = args.includes('--local-commits');
      const amend = args.includes('--amend');
      const simulate = args.includes('--simulate');

      // Validate mutual exclusion: --amend and --local-commits cannot be used together
      if (amend && localCommits) {
        process.stderr.write('Error: --amend and --local-commits are mutually exclusive. Use one or the other.\n');
        process.exit(EXIT_FAILURE);
      }

      // Parse --model flag
      let model: string | undefined;
      const modelIdx = args.indexOf('--model');
      if (modelIdx !== -1 && modelIdx + 1 < args.length) {
        model = args[modelIdx + 1];
      }

      // Parse --thinking-level flag
      let thinkingLevel: typeof CLAUDE_THINKING_LEVELS[number] | undefined;
      const thinkingLevelIdx = args.indexOf('--thinking-level');
      if (thinkingLevelIdx !== -1) {
        const value = args[thinkingLevelIdx + 1];
        if (!value) {
          process.stderr.write(
            `Error: --thinking-level requires a value (${CLAUDE_THINKING_LEVELS.join(', ')}).\n`
          );
          process.exit(EXIT_FAILURE);
        }
        if (!isClaudeThinkingLevel(value)) {
          process.stderr.write(
            `Error: invalid --thinking-level "${value}". Use ${CLAUDE_THINKING_LEVELS.join(', ')}.\n`
          );
          process.exit(EXIT_FAILURE);
        }
        thinkingLevel = value;
      }

      // Parse --timeout flag
      let timeout: number | undefined;
      const timeoutIdx = args.indexOf('--timeout');
      if (timeoutIdx !== -1 && timeoutIdx + 1 < args.length) {
        const val = parseInt(args[timeoutIdx + 1], 10);
        if (!isNaN(val) && val > 0) {
          timeout = val;
        }
      }

      const { createBus } = await import('./events.js');
      const { runLoop } = await import('./loop.js');
      const { printLogo } = await import('./display/quetz.js');
      const bus = createBus();

      // TUI mode: render Rezi dashboard if TTY
      if (process.stdout.isTTY) {
        const { mountApp } = await import('./ui/App.js');

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../package.json');

        // Quit promise: resolves when the user asks to exit from the TUI.
        let resolveQuit!: () => void;
        const quitPromise = new Promise<void>(resolve => { resolveQuit = resolve; });

        const app = mountApp({ bus, version: pkg.version, onQuit: resolveQuit });

        // Yield one event-loop tick so bus listeners register before runLoop emits.
        await new Promise<void>(resolve => setImmediate(resolve));

        let loopResult: import('./loop.js').LoopResult = { exitCode: 0, reason: 'victory' };

        const exitMessage = (result: import('./loop.js').LoopResult, interrupted: boolean): string => {
          if (interrupted) return 'The serpent withdraws — interrupted by user.\n';
          switch (result.reason) {
            case 'victory':   return 'The serpent rests — all issues resolved. 🐉\n';
            case 'no_issues': return 'The serpent sleeps — no ready issues found.\n';
            case 'error':     return `The serpent retreats (exit code ${result.exitCode} — runtime failure).\n`;
            default:          return `Quetz stopped (exit code ${result.exitCode}).\n`;
          }
        };

        let cleaningUp = false;
        const cleanupTui = async (interrupted: boolean) => {
          if (cleaningUp) return;
          cleaningUp = true;
          await app.unmount();
          // Restore terminal: show cursor, exit alt screen
          process.stdout.write('\x1b[2J\x1b[H\x1b[0m\x1b[?1049l\x1b[?25h');
          printLogo();
          process.stdout.write('\n' + exitMessage(loopResult, interrupted));
          process.exit(loopResult.exitCode);
        };

        const onSigint = () => { void cleanupTui(true); };
        process.once('SIGINT', onSigint);

        // Run the loop. On success, auto-exit. On error, stay alive so the user
        // can read the highlighted failure before pressing q to quit.
        let userQuit = false;
        const exitSignal = new Promise<void>(resolve => {
          runLoop({ model, thinkingLevel, timeout, localCommits, amend, simulate }, bus)
            .then(r => {
              loopResult = r;
              if (r.exitCode === 0) resolve();
            })
            .catch(() => { loopResult = { exitCode: 1, reason: 'error' }; resolve(); });
          quitPromise.then(() => { userQuit = true; resolve(); });
        });

        await exitSignal;

        process.off('SIGINT', onSigint);
        await cleanupTui(userQuit);
      } else {
        // Non-TUI fallback (piped, no TTY)
        const result = await runLoop({ model, thinkingLevel, timeout, localCommits, amend, simulate }, bus);
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

// Only run when executed directly (not when imported by tests)
if (require.main === module) {
  main().catch((err: unknown) => {
    const e = err as { exitCode?: number; message?: string };
    process.stderr.write(`\nError: ${e.message ?? String(err)}\n`);
    process.exit(e.exitCode ?? EXIT_FAILURE);
  });
}
