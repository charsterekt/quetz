// ASCII art, startup animation, usage banner (spec 4.3, 6.2)

import { brand, dim } from './terminal.js';

// ── ASCII serpent art (spec 6.2) ────────────────────────────────────────────

const SERPENT_ART = [
  '        ___            ',
  '    ~~~/ o \\~~~>       ',
  '   ~~~|  =  |~~>  QUETZ v0.1.0',
  '   ~~~\\___/~~~>   The Feathered Serpent Dev Loop',
  '       ||||           ',
  '      ~~||~~          ',
  '        ~~            ',
];

// ── Usage banner (spec 4.3) ─────────────────────────────────────────────────

const USAGE_BANNER_LINES = [
  ' ╔══════════════════════════════════════════╗',
  ' ║   QUETZ — The Feathered Serpent Loop     ║',
  ' ║                                          ║',
  ' ║   init       Setup config & checks       ║',
  ' ║   run        Start the dev loop          ║',
  ' ║   run --dry  Preview without executing   ║',
  ' ║   status     Show loop progress          ║',
  ' ║   help       Show all commands           ║',
  ' ╚══════════════════════════════════════════╝',
];

// ── Exports ─────────────────────────────────────────────────────────────────

export function getUsageBanner(): string {
  return USAGE_BANNER_LINES.map(line => brand(line)).join('\n');
}

export function printUsageBanner(): void {
  process.stdout.write(getUsageBanner() + '\n\n');
}

export function getSerpentArt(): string {
  return SERPENT_ART.map(line => brand(line)).join('\n');
}

export function printSerpentStatic(): void {
  process.stdout.write('\n' + getSerpentArt() + '\n\n');
}

/**
 * Animate the serpent flying in from the left over ~1 second.
 * Each frame shifts the art rightward from offscreen.
 * Respects animations flag — if false, prints static art.
 */
export async function printSerpentAnimated(animate: boolean = true): Promise<void> {
  if (!animate) {
    printSerpentStatic();
    return;
  }

  const maxWidth = Math.max(...SERPENT_ART.map(l => l.length));
  const totalFrames = 12;
  const frameDuration = 80; // ~960ms total

  for (let frame = 0; frame <= totalFrames; frame++) {
    // Calculate offset: start fully offscreen left, end at position 0
    const offset = Math.round((1 - frame / totalFrames) * maxWidth);

    // Move cursor up to overwrite previous frame (except first frame)
    if (frame > 0) {
      process.stdout.write(`\x1b[${SERPENT_ART.length}A`);
    }

    for (const line of SERPENT_ART) {
      // Shift line: trim from left by offset amount, pad with spaces
      const visible = offset >= line.length ? '' : line.slice(offset);
      process.stdout.write(brand(visible) + '\x1b[K\n');
    }

    if (frame < totalFrames) {
      await sleep(frameDuration);
    }
  }

  process.stdout.write('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function printHelp(): void {
  printUsageBanner();
  process.stdout.write(
    'Commands:\n' +
    '  quetz init           First-time setup. Generates .quetzrc.yml, runs preflight\n' +
    '                       checks, optionally scaffolds GitHub Actions.\n\n' +
    '  quetz run            Start the dev loop. Runs until all issues are resolved\n' +
    '                       or a failure occurs.\n\n' +
    'Flags for "quetz run":\n' +
    '  --dry                Show what would happen: lists issues, prints first prompt,\n' +
    '                       exits without spawning.\n' +
    '  --model <model>      Override agent model (haiku, sonnet). Default: sonnet.\n' +
    '  --timeout <minutes>  Override agent timeout in minutes. Default: 30.\n' +
    '  --verbose            Enable debug logging.\n' +
    '  --no-animate         Disable terminal animations.\n\n' +
    '  quetz validate       Validate .quetzrc.yml without running the loop.\n\n' +
    '  quetz config show    Display parsed configuration from .quetzrc.yml.\n\n' +
    '  quetz status         Show current loop state: issues remaining, what\'s in\n' +
    '                       progress, last completed issue.\n\n' +
    '  quetz help, -h, --help   Show all commands with descriptions.\n' +
    '  quetz --version, -v      Show quetz version.\n'
  );
}
