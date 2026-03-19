// Colour helpers, ANSI codes, terminal size (spec 6.1)

import chalk, { type ChalkInstance } from 'chalk';

// ── Colour support detection ────────────────────────────────────────────────

let colorsEnabled = true;

export function setColorsEnabled(enabled: boolean): void {
  colorsEnabled = enabled;
}

function c(style: ChalkInstance): (text: string) => string {
  return (text: string) => (colorsEnabled ? style(text) : text);
}

// ── Colour palette (spec 6.1) ───────────────────────────────────────────────

export const brand     = c(chalk.green.bold);     // Quetz branding / banner
export const issueId   = c(chalk.cyan.bold);      // Issue IDs — easy to spot
export const success   = c(chalk.green);           // Merged, completed
export const waiting   = c(chalk.yellow);          // In progress / polling
export const error     = c(chalk.red.bold);        // Errors / failures
export const dim       = c(chalk.gray);            // Timestamps, metadata
export const separator = c(chalk.magenta);         // Agent separator lines

// ── Terminal width ──────────────────────────────────────────────────────────

export function getTerminalWidth(): number {
  return process.stdout.columns ?? 80;
}

// ── Wipe transition (spec 6.5) ──────────────────────────────────────────────

export function wipeTransition(): void {
  const width = getTerminalWidth();
  process.stdout.write(separator('─'.repeat(width)) + '\n');
}
