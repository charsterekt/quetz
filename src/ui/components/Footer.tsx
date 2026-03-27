import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { QuetzPhase } from '../../events.js';
import type { FocusPane, ScreenMode } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const PHASE_LABELS: Record<QuetzPhase, string> = {
  agent_running: 'agent running',
  pr_detecting: 'pr detecting',
  pr_polling: 'waiting for merge',
  git_reset: 'git reset',
  assembling: 'assembling',
  fetching: 'fetching',
  commit_verifying: 'verifying',
  amend_verifying: 'verifying',
  completed: 'done',
  error: 'failed',
  idle: '',
};

interface FooterProps {
  mode: ScreenMode;
  focusedPane: FocusPane;
  hasHistory: boolean;
  phase: QuetzPhase;
  issueId: string;
  issueCount: { current: number; total: number };
  prNumber: number | null;
  elapsed: string;
  version: string;
}

function controlsText(mode: ScreenMode, focusedPane: FocusPane, hasHistory: boolean, version: string): string {
  const quitHint = 'q / ctrl+c quit';

  if (mode === 'session_detail') {
    return `esc back  ↑↓ detail  ${quitHint}  ◆ v${version}`;
  }

  if (mode === 'victory' || mode === 'failure') {
    return hasHistory
      ? `${quitHint}  h history  ◆ v${version}`
      : `${quitHint}  ◆ v${version}`;
  }

  if (focusedPane === 'sessions') {
    return `${quitHint}  ←→ panes  ↑↓ sessions  enter open  [ ] log  ◆ v${version}`;
  }

  return hasHistory
    ? `${quitHint}  h history  ←→ panes  ↑↓ agent  , . line  [ ] log  ◆ v${version}`
    : `${quitHint}  ←→ panes  ↑↓ agent  , . line  [ ] log  ◆ v${version}`;
}

export function Footer({
  mode,
  focusedPane,
  hasHistory,
  phase,
  issueId,
  issueCount,
  prNumber,
  elapsed,
  version,
}: FooterProps) {
  const leftColor =
    phase === 'error' ? fg(c.error) :
    phase === 'pr_polling' ? fg(c.accent) :
    fg(c.brand);

  const prStr = prNumber != null ? `pr: #${prNumber}` : 'pr: ---';
  const prColor = prNumber != null ? fg(c.text) : fg(c.muted);
  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const leftPrefix = `◆ issue ${issueCount.current}/${issueCount.total}  |  ${issueId}  |  ${phaseLabel}  |  `;
  const leftSuffix = `  |  ${elapsed}`;
  const right = controlsText(mode, focusedPane, hasHistory, version);

  return ui.box(
    {
      border: 'single',
      borderTop: true,
      borderBottom: false,
      borderLeft: false,
      borderRight: false,
      borderStyle: { fg: fg(c.border) },
      style: { bg: rgb(15, 15, 15) },
      px: 2,
      width: 'full',
    },
    [
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.row({ items: 'center' }, [
          ui.text(leftPrefix, { style: { fg: leftColor } }),
          ui.text(prStr, { style: { fg: prColor } }),
          ui.text(leftSuffix, { style: { fg: leftColor } }),
        ]),
        ui.text(right, { style: { fg: fg(c.muted) } }),
      ]),
    ]
  );
}
