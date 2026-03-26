// VictoryCard component — spec §7.9, §5.4
// Full-screen victory overlay (Screen 3), shown when loop:victory fires

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { VictoryData } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const FOOTER_BG = rgb(15, 15, 15); // #0F0F0F
const CARD_BG = rgb(10, 10, 10);   // #0A0A0A

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
  const totalTime = data?.totalTime ?? '—';
  const prsMerged = data?.prsMerged ?? 0;

  // Victory footer (different from main footer)
  const victoryFooter = ui.box(
    {
      border: 'single',
      borderTop: true,
      borderBottom: false,
      borderLeft: false,
      borderRight: false,
      borderStyle: { fg: fg(c.border) },
      style: { bg: FOOTER_BG },
      px: 3,
      width: 'full',
    },
    [
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('◆ all done  |  exit code 0', { style: { fg: fg(c.brand) } }),
        ui.text(`q quit  ◆ v${version}`, { style: { fg: fg(c.muted) } }),
      ]),
    ]
  );

  // Card content
  const card = ui.column(
    {
      width: cardWidth,
      style: { bg: CARD_BG },
      px: 3,
      py: 2,
    },
    [
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
        ui.text('prs_merged', { style: { fg: fg(c.dim) } }),
        ui.text(String(prsMerged), { style: { fg: fg(c.brand), bold: true } }),
      ]),
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('session_date', { style: { fg: fg(c.dim) } }),
        ui.text(sessionDate, { style: { fg: fg(c.dim) } }),
      ]),
      spacer(1),
      divider(),
      spacer(2),
      ui.text('the serpent rests.', { style: { fg: fg(c.brand), bold: true } }),
      ui.text('run quetz again to continue a new session', { style: { fg: fg(c.muted) } }),
    ]
  );

  return ui.column({ flex: 1, height: 'full', width: 'full', style: { bg: CARD_BG } }, [
    // Centered card body
    ui.row({ flex: 1, height: 'full', width: 'full' }, [
      ui.column({ flex: 1, height: 'full' }, []),
      card,
      ui.column({ flex: 1, height: 'full' }, []),
    ]),
    victoryFooter,
  ]);
}
