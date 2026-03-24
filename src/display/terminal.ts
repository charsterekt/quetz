// Colour helpers (spec 6.1)
// Chalk natively respects NO_COLOR / FORCE_COLOR env vars and TTY detection.

import chalk from 'chalk';

// ── Colour palette (spec 6.1) ───────────────────────────────────────────────

export const brand   = chalk.green.bold;
export const success = chalk.green;
export const waiting = chalk.yellow;
export const error   = chalk.red.bold;
export const dim     = chalk.gray;
