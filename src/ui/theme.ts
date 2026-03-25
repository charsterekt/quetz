// Color constants for Quetz TUI v2 — chalk-based coloring helpers.
// Two distinct greens: logo (#0DBC79) is logo-only; brand (#10B981) is all other brand elements.
import chalk from 'chalk';

export const c = {
  bg:       chalk.hex('#0A0A0A'),
  surface:  chalk.hex('#0F0F0F'),
  surface2: chalk.hex('#0D0D0D'),
  border:   chalk.hex('#2a2a2a'),
  logo:     chalk.hex('#0DBC79'),
  brand:    chalk.hex('#10B981'),
  accent:   chalk.hex('#F59E0B'),
  cyan:     chalk.hex('#06B6D4'),
  agent:    chalk.hex('#A855F7'),
  error:    chalk.hex('#EF4444'),
  text:     chalk.hex('#FAFAFA'),
  dim:      chalk.hex('#6B7280'),
  muted:    chalk.hex('#4B5563'),
  sbTrack:  chalk.hex('#141414'),
  sbThumb:  chalk.hex('#3F3F3F'),
  failDark: chalk.hex('#3F1515'),
} as const;

// Legacy named exports for backward compatibility with old Ink theme consumers
export const colors = {
  brand: 'green',
  brandBold: 'greenBright',
  text: 'white',
  issue: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  dim: 'gray',
  border: 'gray',
  divider: 'gray',
  agentHeader: 'cyan',
  quetzHeader: 'magenta',
  toolName: 'cyan',
  pr: 'blue',
  scrollThumb: 'green',
  scrollTrack: 'gray',
} as const;

export const phaseIcons: Record<string, string> = {
  idle: '○',
  fetching: '◌',
  git_reset: '◌',
  assembling: '◌',
  agent_running: '◉',
  pr_detecting: '◎',
  pr_polling: '◎',
  completed: '●',
  error: '✗',
};

/** Icon and color for each tool name (legacy helper) */
export function getToolStyle(toolName: string): { icon: string; color: string } {
  const n = toolName.toLowerCase();
  if (n === 'bash') return { icon: '$', color: 'magenta' };
  if (['write', 'edit', 'notebookedit'].includes(n)) return { icon: '▸', color: 'yellow' };
  if (['webfetch', 'websearch'].includes(n)) return { icon: '▸', color: 'blue' };
  if (n === 'agent') return { icon: '▸', color: 'greenBright' };
  return { icon: '▸', color: 'cyan' };
}
