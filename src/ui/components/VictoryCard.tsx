// VictoryCard component - spec sections 7.9 and 5.4
// Full-screen victory overlay shown when loop:victory fires

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { VictoryData } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const CARD_BG = rgb(10, 10, 10);

interface VictoryCardProps {
  data: VictoryData | null;
  version: string;
  key?: string;
}

function divider() {
  return ui.box(
    {
      border: 'single',
      borderTop: false,
      borderLeft: false,
      borderRight: false,
      borderBottom: true,
      borderStyle: { fg: fg(c.border) },
      width: 'full',
      height: 1,
    },
    []
  );
}

function spacer(size: number) {
  return ui.spacer({ size });
}

export function VictoryCard({ data, version }: VictoryCardProps) {
  const termCols = process.stdout.columns ?? 120;
  const cardWidth = Math.round(termCols * 0.49);

  const vSpaced = 'v ' + version.split('').join(' ');
  const serpentRow4 = `     (  Q U E T Z  ${vSpaced}  )`;

  const sessionDate = new Date().toISOString().slice(0, 10);
  const issuesCompleted = data?.issuesCompleted ?? 0;
  const totalTime = data?.totalTime ?? '--';
  const prsMerged = data?.prsMerged ?? 0;
  const mode = data?.mode ?? 'pr';
  const isCommitMode = mode === 'commit';
  const isAmendMode = mode === 'amend';
  const primaryStatLabel = isAmendMode ? 'commit_ready' : (isCommitMode ? 'commits_landed' : 'prs_merged');
  const primaryStatValue = isAmendMode
    ? (data?.commitHash?.slice(0, 7) ?? '1')
    : String(isCommitMode ? (data?.commitsLanded ?? issuesCompleted) : prsMerged);
  const restingText = isAmendMode ? 'the serpent prepares a final commit.' : 'the serpent rests.';
  const nextRunText = isAmendMode
    ? (data?.commitMsg ? `latest: ${data.commitMsg}` : 'push when ready to land the final commit')
    : 'run quetz again to continue a new session';

  const card = ui.box(
    {
      width: cardWidth,
      border: 'single',
      borderStyle: { fg: fg(c.accent) },
      style: { bg: CARD_BG },
      px: 4,
      py: 3,
    },
    [
      ui.column({ width: 'full', gap: 0 }, [
        ui.text('[ all issues resolved ]', { style: { fg: fg(c.accent), bold: true } }),
        ui.text('the feathered serpent completes its journey', { style: { fg: fg(c.dim) } }),
        spacer(2),
        ui.text('      ~*~*~*~*~*~*~*~*~*~*~*~*~*~>', { style: { fg: fg(c.brand) } }),
        ui.text(serpentRow4, { style: { fg: fg(c.text), bold: true } }),
        ui.text('      ~*~*~*~*~*~*~*~*~*~*~*~*~*~>', { style: { fg: fg(c.cyan) } }),
        ui.text('              |||||', { style: { fg: fg(c.muted) } }),
        ui.text('            ~~|||||~~', { style: { fg: fg(c.muted) } }),
        ui.text('              ~~~~~', { style: { fg: fg(c.cyan) } }),
        spacer(2),
        divider(),
        spacer(1),
        ui.row({ justify: 'between', width: 'full', items: 'center' }, [
          ui.text('issues_completed', { style: { fg: fg(c.dim) } }),
          ui.text(String(issuesCompleted), { style: { fg: fg(c.brand), bold: true } }),
        ]),
        ui.row({ justify: 'between', width: 'full', items: 'center' }, [
          ui.text('total_time', { style: { fg: fg(c.dim) } }),
          ui.text(totalTime, { style: { fg: fg(c.brand), bold: true } }),
        ]),
        ui.row({ justify: 'between', width: 'full', items: 'center' }, [
          ui.text(primaryStatLabel, { style: { fg: fg(c.dim) } }),
          ui.text(primaryStatValue, { style: { fg: fg(c.brand), bold: true } }),
        ]),
        ui.row({ justify: 'between', width: 'full', items: 'center' }, [
          ui.text('session_date', { style: { fg: fg(c.dim) } }),
          ui.text(sessionDate, { style: { fg: fg(c.dim) } }),
        ]),
        spacer(1),
        divider(),
        spacer(2),
        ui.text(restingText, { style: { fg: fg(c.brand), bold: true } }),
        ui.text(nextRunText, { style: { fg: fg(c.muted) } }),
      ]),
    ]
  );

  return ui.column({ flex: 1, width: 'full', style: { bg: CARD_BG } }, [
    ui.row({ flex: 1, height: 'full', width: 'full' }, [
      ui.column({ flex: 1, height: 'full' }, []),
      card,
      ui.column({ flex: 1, height: 'full' }, []),
    ]),
  ]);
}
