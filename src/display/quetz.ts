/* Quetz text logo */

import chalk from 'chalk';

// Simple text lines for Ink TUI (Logo.tsx)
export const logoLines: string[] = [
  chalk.green.bold('quetz'),
  chalk.gray('autonomous dev loop'),
];

export function printLogo(): void {
  process.stdout.write('\n');
  process.stdout.write('  ' + chalk.green.bold('quetz') + '\n');
  process.stdout.write('  ' + chalk.gray('autonomous dev loop') + '\n');
  process.stdout.write('\n');
}
