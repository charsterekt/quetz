import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { QuetzPhase } from '../../events.js';
import type { CompletedSession, FailureData, FocusPane, ScreenMode } from '../state.js';

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
  viewingSession: CompletedSession | null;
  failureData: FailureData | null;
}

function controlsText(mode: ScreenMode, focusedPane: FocusPane, hasHistory: boolean, version: string): string {
  const quitHint = 'q quit';

  if (mode === 'running' || mode === 'polling') {
    if (!hasHistory) {
      return `${quitHint}  ←→ panes  , . line  [ ] log  ◆ v${version}`;
    }

    return focusedPane === 'sessions'
      ? `${quitHint}  h history  ←→ panes  ↑↓ sessions  enter open  [ ] log  ◆ v${version}`
      : `${quitHint}  h history  ←→ panes  ↑↓ sessions  enter open  , . line  [ ] log  ◆ v${version}`;
  }

  if (mode === 'victory' || mode === 'failure') {
    return `${quitHint}  ◆ v${version}`;
  }

  return `bg: ${focusedPane === 'sessions' ? 'history open' : 'agent running'}  |  ${quitHint}  ◆ v${version}`;
}

function detailRightText(issueId: string, phase: QuetzPhase, elapsed: string, version: string): string {
  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  if (!issueId) {
    return `◆ v${version}`;
  }
  return `bg: ${issueId} ${phaseLabel}  |  ${elapsed}  |  ◆ v${version}`;
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
  viewingSession,
  failureData,
}: FooterProps) {
  let leftText = '';
  let leftColor = fg(c.brand);
  let right = controlsText(mode, focusedPane, hasHistory, version);

  if (mode === 'victory') {
    leftText = '◆ all done  |  exit code 0';
  } else if (mode === 'failure') {
    const failureIssueId = failureData?.issueId ?? issueId;
    const failurePrNumber = failureData?.prNumber ?? prNumber;
    const failureLabel = failureData?.reason === 'CI failed' ? '● ci failed' : '● run failed';
    leftText = `${failureLabel}  |  pr: ${failurePrNumber != null ? `#${failurePrNumber}` : '---'}  |  issue: ${failureIssueId || '---'}  |  exit code 1`;
    leftColor = fg(c.error);
  } else if (mode === 'session_detail') {
    leftText = `← esc  back to main  |  session: ${viewingSession?.id ?? '---'}`;
    leftColor = fg(c.muted);
    right = detailRightText(issueId, phase, elapsed, version);
  } else {
    const prStr = prNumber != null ? `pr: #${prNumber}` : 'pr: ---';
    const phaseLabel = PHASE_LABELS[phase] ?? phase;
    leftText = `◆ issue ${issueCount.current}/${issueCount.total}  |  ${issueId}  |  ${phaseLabel}  |  ${prStr}  |  ${elapsed}`;
    leftColor =
      phase === 'error' ? fg(c.error) :
      phase === 'pr_polling' ? fg(c.accent) :
      fg(c.brand);
  }

  return ui.box(
    {
      border: 'single',
      borderTop: true,
      borderBottom: false,
      borderLeft: false,
      borderRight: false,
      borderStyle: { fg: fg(c.border) },
      style: { bg: rgb(15, 15, 15) },
      px: mode === 'session_detail' ? 3 : 2,
      width: 'full',
    },
    [
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text(leftText, { style: { fg: leftColor } }),
        ui.text(right, { style: { fg: fg(c.muted) } }),
      ]),
    ]
  );
}
