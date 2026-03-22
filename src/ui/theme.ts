// Color constants for Ink TUI dashboard

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

/** Icon and color for each tool name */
export function getToolStyle(toolName: string): { icon: string; color: string } {
  const n = toolName.toLowerCase();
  if (n === 'bash') return { icon: '$', color: 'magenta' };
  if (['write', 'edit', 'notebookedit'].includes(n)) return { icon: '▸', color: 'yellow' };
  if (['webfetch', 'websearch'].includes(n)) return { icon: '▸', color: 'blue' };
  if (n === 'agent') return { icon: '▸', color: 'greenBright' };
  // Read, Glob, Grep, and anything else
  return { icon: '▸', color: 'cyan' };
}
