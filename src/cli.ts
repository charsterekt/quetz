#!/usr/bin/env node

// Exit codes per spec section 7.4
export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_PREFLIGHT_FAILURE = 3;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    const { printHelp } = await import('./display/banner.js');
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
      const noAnimate = args.includes('--no-animate');

      // Show startup serpent animation on `quetz run` (spec 6.2)
      const { printSerpentAnimated } = await import('./display/banner.js');
      await printSerpentAnimated(!noAnimate);

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
      const { printHelp } = await import('./display/banner.js');
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
