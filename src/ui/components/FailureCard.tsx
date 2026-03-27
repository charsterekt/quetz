// FailureCard component - spec sections 7.10 and 5.4
// Full-screen failure overlay (Screen 4), shown when loop:failure fires

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { FailureData } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const CARD_BG = rgb(10, 10, 10);

interface FailureCardProps {
  data: FailureData | null;
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
      borderStyle: { fg: fg(c.failDark) },
      width: 'full',
      height: 1,
    },
    []
  );
}

function spacer(size: number) {
  return ui.spacer({ size });
}

export function FailureCard({ data }: FailureCardProps) {
  const termCols = process.stdout.columns ?? 120;
  const cardWidth = Math.round(termCols * 0.49);

  const prNumber = data?.prNumber;
  const issueId = data?.issueId;
  const elapsed = data?.elapsed;
  const failedChecks = data?.failedChecks;
  const reason = data?.reason ?? 'unknown error';

  const subtitle = prNumber
    ? `ci checks failed on pr #${prNumber} — the serpent was stopped`
    : `${reason.toLowerCase()} — the serpent was stopped`;

  const statsRows: ReturnType<typeof ui.row>[] = [];
  if (failedChecks) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('failed_checks', { style: { fg: fg(c.dim) } }),
        ui.text(failedChecks, { style: { fg: fg(c.error), bold: true } }),
      ])
    );
  }
  if (prNumber !== undefined) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('pr_number', { style: { fg: fg(c.dim) } }),
        ui.text(`#${prNumber}`, { style: { fg: fg(c.error), bold: true } }),
      ])
    );
  }
  if (issueId) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('issue_id', { style: { fg: fg(c.dim) } }),
        ui.text(issueId, { style: { fg: fg(c.dim) } }),
      ])
    );
  }
  if (elapsed) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('time_elapsed', { style: { fg: fg(c.dim) } }),
        ui.text(elapsed, { style: { fg: fg(c.dim) } }),
      ])
    );
  }
  if (statsRows.length === 0) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('reason', { style: { fg: fg(c.dim) } }),
        ui.text(reason, { style: { fg: fg(c.error), bold: true } }),
      ])
    );
  }

  const card = ui.box(
    {
      width: cardWidth,
      border: 'single',
      borderStyle: { fg: fg(c.error) },
      style: { bg: CARD_BG },
      px: 4,
      py: 3,
    },
    [
      ui.column({ width: 'full', gap: 0 }, [
        ui.text('[ build failed ]', { style: { fg: fg(c.error), bold: true } }),
        ui.text(subtitle, { style: { fg: fg(c.dim) } }),
        spacer(2),
        ui.text('      ~*~*~*~> ✗', { style: { fg: fg(c.brand) } }),
        ui.text('     (  q u e t z  r e t r e a t s  )', { style: { fg: fg(c.muted) } }),
        ui.text('              |', { style: { fg: fg(c.muted) } }),
        ui.text('           ~~|||~~', { style: { fg: fg(c.failDark) } }),
        ui.text('              ~~~', { style: { fg: fg(c.failDark) } }),
        spacer(2),
        divider(),
        spacer(1),
        ...statsRows,
        spacer(1),
        divider(),
        spacer(2),
        ui.text('the serpent retreats.', { style: { fg: fg(c.error), bold: true } }),
        ui.text('fix the issue and run quetz again.', { style: { fg: fg(c.muted) } }),
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
