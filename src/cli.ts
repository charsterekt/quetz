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
      const verbose = args.includes('--verbose');

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

      // Show startup serpent animation on `quetz run` (spec 6.2)
      const { printSerpentAnimated } = await import('./display/banner.js');
      await printSerpentAnimated(!noAnimate);

      const { runLoop } = await import('./loop.js');
      await runLoop({ dry, model, timeout, verbose });
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
