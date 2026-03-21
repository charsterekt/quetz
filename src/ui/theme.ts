// Color constants for Ink TUI dashboard

export const colors = {
  brand: 'green',
  brandBold: 'greenBright',
  issue: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  dim: 'gray',
  border: 'green',
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
