// Hex color palette for Rezi TUI (spec §4.3)
// All values are hex strings for use with rgb() from @rezi-ui/core

export const c = {
  logo:    '#0DBC79',   // QUETZ logo only
  brand:   '#10B981',   // all other brand elements
  accent:  '#F59E0B',   // amber highlights
  cyan:    '#06B6D4',   // issue IDs, info
  agent:   '#A855F7',   // agent title bar
  error:   '#EF4444',   // failure/error
  text:    '#FAFAFA',   // primary text
  dim:     '#6B7280',   // secondary/muted text
  muted:   '#4B5563',   // even more muted
  border:  '#2a2a2a',   // panel borders
  failDark:'#3F1515',   // failure card background
  sbTrack: '#141414',   // scrollbar track
  sbThumb: '#3F3F3F',   // scrollbar thumb
  bg:      '#0A0A0A',   // root background
} as const;

export const phaseIcons: Record<string, string> = {
  idle: '○',
  fetching: '◌',
  git_reset: '◌',
  assembling: '◌',
  agent_running: '◉',
  pr_detecting: '◎',
  pr_polling: '◎',
  commit_verifying: '◎',
  amend_verifying: '◎',
  completed: '●',
  error: '✗',
};

/** Parse "#RRGGBB" to [r, g, b] tuple */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
