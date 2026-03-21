// ASCII art, startup animation, usage banner (spec 4.3, 6.2)

import { brand, dim, chrome } from './terminal.js';
import { ANSI, cols, rows, writeCentered } from './tui.js';

// ── Full-screen serpent art (spec 6.2) ───────────────────────────────────────

const SERPENT_ART = [
  '                                                              ',
  '  ≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋         ',
  '≋≋≋                                                ≋≋≋        ',
  '≋     ╔══════════════════════════════════════╗      ≋         ',
  '≋     ║  ◉◉                            ◉◉   ║      ≋≋≋≋≋≋≋> ',
  '≋≋≋≋≋≋╣                                     ╠≋≋≋≋≋≋≋≋≋≋≋≋≋> ',
  '≋     ║    Q U E T Z     v 0 . 1 . 0        ║      ≋≋≋≋≋≋≋> ',
  '≋     ║                                     ║      ≋         ',
  '≋     ║    The Feathered Serpent Dev Loop   ║      ≋         ',
  '≋≋≋   ╚══════════════════════════════════════╝    ≋≋≋        ',
  '  ≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋         ',
  '                        ║   ║                                 ',
  '                   ≋≋≋≋≋║   ║≋≋≋≋≋                           ',
  '                        ║   ║                                 ',
  '                   ≋≋≋≋≋╩═══╩≋≋≋≋≋                           ',
  '                                                              ',
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
 * Animate the serpent on startup.
 * In TUI mode (alt screen active): centers the art on screen, slides in from left.
 * In plain mode: prints static art to stdout.
 */
export async function printSerpentAnimated(animate: boolean = true): Promise<void> {
  if (!animate) {
    printSerpentStatic();
    return;
  }

  const artWidth = Math.max(...SERPENT_ART.map(l => l.length));
  const artHeight = SERPENT_ART.length;
  const totalFrames = 14;
  const frameDuration = 60; // ~840ms total

  // Vertical centering
  const termRows = rows();
  const termCols = cols();
  const startRow = Math.max(1, Math.floor((termRows - artHeight) / 2));
  const centerPad = Math.max(0, Math.floor((termCols - artWidth) / 2));

  for (let frame = 0; frame <= totalFrames; frame++) {
    const slideOffset = Math.round((1 - frame / totalFrames) * artWidth);

    for (let i = 0; i < artHeight; i++) {
      const line = SERPENT_ART[i];
      const visible = slideOffset >= line.length ? '' : line.slice(slideOffset);
      const pad = ' '.repeat(Math.max(0, centerPad - slideOffset));
      process.stdout.write(
        ANSI.move(startRow + i, 1) + ANSI.clearEol +
        pad + brand(visible)
      );
    }

    if (frame < totalFrames) {
      await sleep(frameDuration);
    }
  }

  // Tagline below the art
  const tagRow = startRow + artHeight + 1;
  writeCentered([dim('press any key or wait…')], tagRow);

  await sleep(800);
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
    '  --no-animate         Disable terminal animations.\n\n' +
    '  quetz validate       Validate .quetzrc.yml without running the loop.\n\n' +
    '  quetz config show    Display parsed configuration from .quetzrc.yml.\n\n' +
    '  quetz status         Show current loop state: issues remaining, what\'s in\n' +
    '                       progress, completed.\n' +
    '  quetz status --watch Real-time monitoring (5s refresh). Press Ctrl+C to exit.\n\n' +
    '  quetz help, -h, --help   Show all commands with descriptions.\n' +
    '  quetz --version, -v      Show quetz version.\n'
  );
}

// ── Box helpers (re-exported for convenience) ────────────────────────────────

export function printSectionBox(title: string, lines: string[]): void {
  const w = cols();
  const inner = w - 4;
  const titleLine = ' ' + title + ' ';
  const titlePad = Math.max(0, inner - titleLine.length - 1);
  process.stdout.write(
    '\n' +
    chrome('  ╭─' + titleLine + '─'.repeat(titlePad) + '─╮') + '\n'
  );
  for (const line of lines) {
    const raw = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, inner - raw.length - 1);
    process.stdout.write(chrome('  │') + ' ' + line + ' '.repeat(pad) + chrome(' │') + '\n');
  }
  process.stdout.write(chrome('  ╰' + '─'.repeat(inner + 2) + '╯') + '\n\n');
}
