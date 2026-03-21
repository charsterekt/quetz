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
} as const;

export const phaseIcons: Record<string, string> = {
  idle: ' ',
  fetching: '...',
  git_reset: '...',
  assembling: '...',
  agent_running: 'AGT',
  pr_detecting: '???',
  pr_polling: '...',
  completed: 'OK ',
  error: 'ERR',
};
