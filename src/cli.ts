#!/usr/bin/env node

// Exit codes per spec section 7.4
export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_PREFLIGHT_FAILURE = 3;

async function main(): Promise<void> {
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
    process.stdout.write('  run --simulate    Simulate the full loop (mock + fake lifecycle)\n');
    process.stdout.write('  run --model <m>   Override agent model\n');
    process.stdout.write('  run --timeout <m> Override agent timeout (minutes)\n');
    process.stdout.write('  status            Show loop progress\n');
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
      const bus = createBus();

      // TUI mode: render Ink dashboard if TTY and not dry-run
      if (process.stdout.isTTY && !dry) {
        const cols = process.stdout.columns ?? 80;
        const rows = process.stdout.rows ?? 24;
        if (cols < 100 || rows < 30) {
          process.stderr.write(`Terminal too small (${cols}x${rows}). Minimum: 100x30.\n`);
          process.exit(EXIT_FAILURE);
        }
        if (cols < 120 || rows < 40) {
          process.stderr.write(`Warning: terminal ${cols}x${rows} is below recommended 120x40.\n`);
        }

        const React = require('react');
        const { initInk } = await import('./ui/ink-imports.js');
        const inkModule = await initInk();
        const { App } = await import('./ui/App.js');

        // Enter alternate screen
        process.stdout.write('\x1b[?1049h');

        const app = inkModule.render(React.createElement(App, { bus }));
        const result = await runLoop({ dry, model, timeout, localCommits, amend, mock, simulate }, bus);

        app.unmount();
        process.stdout.write('\x1b[?1049l'); // leave alternate screen
        process.exit(result.exitCode);
      } else {
        // Non-TUI fallback (piped, dry-run, no TTY)
        const result = await runLoop({ dry, model, timeout, localCommits, amend, mock, simulate }, bus);
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
