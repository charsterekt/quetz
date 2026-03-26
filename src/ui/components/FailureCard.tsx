// FailureCard component — spec §7.10, §5.4
// Full-screen failure overlay (Screen 4), shown when loop:failure fires

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { FailureData } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const FOOTER_BG = rgb(15, 15, 15); // #0F0F0F
const CARD_BG = rgb(10, 10, 10);   // #0A0A0A

interface FailureCardProps {
  data: FailureData | null;
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

export function FailureCard({ data, version }: FailureCardProps) {
  const termCols = process.stdout.columns ?? 120;
  const cardWidth = Math.round(termCols * 0.49);

  const prNumber = data?.prNumber;
  const reason = data?.reason ?? 'unknown error';
  const detail = data?.detail;

  const subtitle = prNumber
    ? `ci checks failed on pr #${prNumber} — the serpent was stopped`
    : `${reason} — the serpent was stopped`;

  // Build footer left text (omit pr segment if no prNumber)
  const footerLeft = prNumber
    ? `● ci failed  |  pr: #${prNumber}  |  exit code 1`
    : `● ci failed  |  exit code 1`;

  // Failure footer (different from main footer)
  const failureFooter = ui.box(
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
        ui.text(footerLeft, { style: { fg: fg(c.error) } }),
        ui.text(`q quit  ◆ v${version}`, { style: { fg: fg(c.muted) } }),
      ]),
    ]
  );

  // Stats rows (conditional)
  const statsRows: ReturnType<typeof ui.row>[] = [];
  if (prNumber !== undefined) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('pr_number', { style: { fg: fg(c.dim) } }),
        ui.text(`#${prNumber}`, { style: { fg: fg(c.error), bold: true } }),
      ])
    );
  }
  statsRows.push(
    ui.row({ justify: 'between', width: 'full', items: 'center' }, [
      ui.text('reason', { style: { fg: fg(c.dim) } }),
      ui.text(reason, { style: { fg: fg(c.error), bold: true } }),
    ])
  );
  if (detail) {
    statsRows.push(
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text('detail', { style: { fg: fg(c.dim) } }),
        ui.text(detail, { style: { fg: fg(c.dim) } }),
      ])
    );
  }

  // Card content
  const card = ui.column(
    {
      width: cardWidth,
      style: { bg: CARD_BG },
      px: 3,
      py: 2,
    },
    [
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
    ]
  );

  return ui.column({ flex: 1, height: 'full', width: 'full', style: { bg: CARD_BG } }, [
    // Centered card body
    ui.row({ flex: 1, height: 'full', width: 'full' }, [
      ui.column({ flex: 1, height: 'full' }, []),
      card,
      ui.column({ flex: 1, height: 'full' }, []),
    ]),
    failureFooter,
  ]);
}
