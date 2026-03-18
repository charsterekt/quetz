#!/usr/bin/env node

// Exit codes per spec section 7.4
export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_PREFLIGHT_FAILURE = 3;

const BANNER = `
 ╔══════════════════════════════════════════╗
 ║   QUETZ — The Feathered Serpent Loop     ║
 ║                                          ║
 ║   init       Setup config & checks       ║
 ║   run        Start the dev loop          ║
 ║   run --dry  Preview without executing   ║
 ║   status     Show loop progress          ║
 ║   help       Show all commands           ║
 ╚══════════════════════════════════════════╝
`;

function printBanner(): void {
  process.stdout.write(BANNER + '\n');
}

function printHelp(): void {
  printBanner();
  process.stdout.write(
    'Commands:\n' +
    '  quetz init           First-time setup. Generates .quetzrc.yml, runs preflight\n' +
    '                       checks, optionally scaffolds GitHub Actions.\n\n' +
    '  quetz run            Start the dev loop. Runs until all issues are resolved\n' +
    '                       or a failure occurs.\n\n' +
    '  quetz run --dry      Show what would happen: lists issues in order, prints\n' +
    '                       the prompt for the first one, exits without spawning.\n\n' +
    '  quetz status         Show current loop state: issues remaining, what\'s in\n' +
    '                       progress, last completed issue.\n\n' +
    '  quetz help           Show all commands with descriptions.\n'
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(EXIT_SUCCESS);
  }

  switch (command) {
    case 'init': {
      const { runInit } = await import('./init.js');
      await runInit();
      break;
    }
    case 'run': {
      const dry = args.includes('--dry');
      const { runLoop } = await import('./loop.js');
      await runLoop({ dry });
      break;
    }
    case 'status': {
      const { showStatus } = await import('./loop.js');
      await showStatus();
      break;
    }
    default: {
      process.stderr.write(`Unknown command: ${command}\n`);
      printHelp();
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
