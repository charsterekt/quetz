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
    process.stdout.write('  init              Initialize quetz in this project\n');
    process.stdout.write('  run               Start the dev loop\n');
    process.stdout.write('  run --dry         Preview without executing\n');
    process.stdout.write('  run --local-commits  Commit locally instead of PR\n');
    process.stdout.write('  run --amend       Amend all work into one commit\n');
    process.stdout.write('  run --simulate    Simulate the full loop (mock + fake PR lifecycle)\n');
    process.stdout.write('  run --simulate --local-commits  Simulate with fake commits (no PRs)\n');
    process.stdout.write('  run --simulate --amend  Simulate with fake amend commits\n');
    process.stdout.write('  run --model <m>   Override agent model\n');
    process.stdout.write(`  run --thinking-level <l> Override Claude effort (${CLAUDE_THINKING_LEVELS.join('|')})\n`);
    process.stdout.write('  run --mock        Use built-in fake issues (no bd required)\n');
    process.stdout.write('  run --timeout <m> Override agent timeout (minutes)\n');
    process.stdout.write('  status            Show loop progress\n');
    process.stdout.write('  status --watch    Live-refreshing status (5s interval)\n');
    process.stdout.write('  status --mock     Status with fake issues (no bd required)\n');
    process.stdout.write('  validate          Validate .quetzrc.yml\n');
    process.stdout.write('  config show       Show resolved config\n');
    process.stdout.write('\n');
    process.exit(EXIT_SUCCESS);
  }

  switch (command) {
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
    }
    case 'run': {
      const dry = args.includes('--dry');
      const localCommits = args.includes('--local-commits');
      const amend = args.includes('--amend');
      const mock = args.includes('--mock');
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

      // TUI mode: render Ink dashboard if TTY and not dry-run
      if (process.stdout.isTTY && !dry) {
        const React = require('react');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { execSync } = require('child_process');
        const { initInk } = await import('./ui/ink-imports.js');
        const inkModule = await initInk();
        const { App } = await import('./ui/App.js');

        // Gather footer metadata (best-effort — ignore errors)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('../package.json');
        const cwd = process.cwd().replace(/\\/g, '/');
        let branch = '';
        try {
          branch = (execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
          }) as string).trim();
        } catch { /* not a git repo */ }

        // MINGW64 / Git Bash: stdin.isTTY may be false even when the terminal is
        // interactive. Ink skips setRawMode when isTTY is falsy, so useInput never
        // fires. Override isTTY and set raw mode manually before render() so Ink
        // treats stdin as a TTY and enables keypress handling.
        if (typeof (process.stdin as any).setRawMode === 'function') {
          if (!process.stdin.isTTY) {
            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
          }
          try {
            (process.stdin as any).setRawMode(true);
            process.stdin.resume();
          } catch { /* keyboard shortcuts unavailable on this terminal */ }
        }

        // Quit promise: resolves when the user asks to exit from the TUI.
        let resolveQuit!: () => void;
        const quitPromise = new Promise<void>(resolve => { resolveQuit = resolve; });

        // Enter alternate screen BEFORE render so Ink never writes to the main
        // screen buffer. If we enter after render(), the first Ink frame lands on
        // the main screen and is then "saved" — restoring it on alt-screen exit
        // produces the ghost UI artifacts the user sees.
        // \x1b[?25l hides the cursor for the entire TUI session: the cursor
        // jumping to new positions on every Ink render is the primary cause of
        // visible flicker, especially in the bottom half of the screen.
        process.stdout.write('\x1b[?1049h\x1b[48;2;10;10;10m\x1b[2J\x1b[H\x1b[?25l');

        const app = inkModule.render(
          React.createElement(App, { bus, onQuit: resolveQuit, cwd, branch, version: pkg.version }),
          { exitOnCtrlC: false },
        );

        // Yield one event-loop tick so React useEffect hooks can register bus
        // listeners before runLoop starts emitting loop:start / loop:issue_pickup.
        await new Promise<void>(resolve => setImmediate(resolve));

        let loopExitCode = 0;

        // cleanupTui: unmount Ink (stops renderer, flushes final sequences to alt
        // screen), then clear the alt screen and restore the main screen.
        // Calling unmount() before \x1b[?1049l ensures Ink's own cursor-movement
        // cleanup lands on the alt screen buffer (discarded on restore) rather
        // than bleeding onto the main screen.
        const cleanupTui = (exitCode: number) => {
          app.unmount();
          process.stdout.write('\x1b[2J\x1b[H\x1b[0m\x1b[?1049l\x1b[?25h');
          printLogo();
          process.stdout.write('\nQuetz stopped.\n');
          process.exit(exitCode);
        };

        // Ctrl+C: in raw mode the terminal sends \x03 (ETX) instead of SIGINT,
        // so a SIGINT handler alone is not enough on MINGW64. We handle SIGINT
        // here as a belt-and-suspenders measure for non-raw-mode terminals.
        const onSigint = () => cleanupTui(loopExitCode);
        process.once('SIGINT', onSigint);

        // Run the loop. On success, auto-exit. On error, stay alive so the user
        // can read the highlighted failure before pressing q to quit.
        const exitSignal = new Promise<void>(resolve => {
          runLoop({ dry, model, thinkingLevel, timeout, localCommits, amend, mock, simulate }, bus)
            .then(r => {
              loopExitCode = r.exitCode;
              if (r.exitCode === 0) resolve(); // success → auto-exit
              // error → stay alive; quitPromise drives the exit
            })
            .catch(() => { loopExitCode = 1; resolve(); });
          quitPromise.then(resolve);
        });

        await exitSignal;

        process.off('SIGINT', onSigint);
        cleanupTui(loopExitCode);
      } else {
        // Non-TUI fallback (piped, dry-run, no TTY)
        const result = await runLoop({ dry, model, thinkingLevel, timeout, localCommits, amend, mock, simulate }, bus);
        process.exit(result.exitCode);
      }
      break;
    }
    case 'status': {
      const watch = args.includes('--watch') || args.includes('-w');
      const mock = args.includes('--mock');
      const { showStatus } = await import('./loop.js');
      await showStatus(watch, mock);
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
