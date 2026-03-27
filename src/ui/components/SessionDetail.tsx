// SessionDetail component — spec §7.8, §5.2
// Full-screen session log view (Screen 5), entered via enter on sessions panel

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import { Scrollbar } from './Scrollbar.js';
import type { CompletedSession, AgentLine } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const HEADER_BG = rgb(15, 15, 15);   // #0F0F0F
const INFO_BG = rgb(13, 13, 13);     // #0D0D0D
const CONTENT_BG = rgb(10, 10, 10); // #0A0A0A

// Chrome rows: header (~6) + info bar (~2) + footer (~2)
const CHROME_ROWS = 10;

interface SessionDetailProps {
  session: CompletedSession;
  scrollOffset: number;
  bgStatus: string;
  version: string;
  key?: string;
}

function renderLine(line: AgentLine, i: number) {
  if (line.type === 'tool') {
    const name = (line.toolName ?? '').padEnd(5).slice(0, 5);
    return ui.text(`▸ ${name}   ${line.content}`, {
      key: String(i),
      style: { fg: fg(c.cyan) },
    });
  }
  return ui.text(line.content || ' ', {
    key: String(i),
    style: { fg: fg(c.text) },
  });
}

export function SessionDetail({ session, scrollOffset, bgStatus, version }: SessionDetailProps) {
  const termRows = process.stdout.rows ?? 40;
  const visibleRows = Math.max(1, termRows - CHROME_ROWS);

  const visibleLines = session.lines.slice(scrollOffset, scrollOffset + visibleRows);
  const lineNodes = visibleLines.length > 0
    ? visibleLines.map((line, i) => renderLine(line, i))
    : [ui.text('no log lines', { style: { fg: fg(c.dim) } })];

  // Right side of info bar
  const rightItems: ReturnType<typeof ui.text>[] = [];
  if (session.prNumber != null) {
    rightItems.push(ui.text(`pr #${session.prNumber}  `, { style: { fg: fg(c.dim) } }));
  }
  const outcomeText = session.outcome === 'merged' ? '✓ merged' : '✗ failed';
  const outcomeColor = session.outcome === 'merged' ? fg(c.brand) : fg(c.error);
  rightItems.push(ui.text(outcomeText + '  ', { style: { fg: outcomeColor, bold: true } }));
  rightItems.push(ui.text(session.duration, { style: { fg: fg(c.muted) } }));

  const infoBar = ui.box(
    {
      border: 'single',
      borderTop: false,
      borderLeft: false,
      borderRight: false,
      borderBottom: true,
      borderStyle: { fg: fg(c.border) },
      style: { bg: INFO_BG },
      px: 3,
      width: 'full',
    },
    [
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.row({ items: 'center', gap: 0 }, [
          ui.text('← esc', { style: { fg: fg(c.muted) } }),
          ui.text('  /  ', { style: { fg: fg(c.border) } }),
          ui.text('completed sessions', { style: { fg: fg(c.muted) } }),
          ui.text('  /  ', { style: { fg: fg(c.border) } }),
          ui.text(`${session.id}  —  ${session.title}`, { style: { fg: fg(c.cyan), bold: true } }),
        ]),
        ui.row({ items: 'center', gap: 0 }, rightItems),
      ]),
    ]
  );

  const rightStatus = bgStatus
    ? `bg: ${bgStatus}  |  ◆ v${version}`
    : `◆ v${version}`;

  const detailFooter = ui.box(
    {
      border: 'single',
      borderTop: true,
      borderBottom: false,
      borderLeft: false,
      borderRight: false,
      borderStyle: { fg: fg(c.border) },
      style: { bg: HEADER_BG },
      px: 4,
      width: 'full',
    },
    [
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        ui.text(`← esc  back to main  |  session: ${session.id}`, { style: { fg: fg(c.muted) } }),
        ui.text(rightStatus, { style: { fg: fg(c.accent), bold: true } }),
      ]),
    ]
  );

  return ui.column({ width: 'full', height: 'full', style: { bg: CONTENT_BG } }, [
    infoBar,
    ui.row({ flex: 1, height: 'full', width: 'full' }, [
      ui.column(
        { flex: 1, overflow: 'hidden', py: 2, px: 4, gap: 0, style: { bg: CONTENT_BG } },
        lineNodes
      ),
      Scrollbar({
        totalLines: session.lines.length,
        visibleLines: visibleRows,
        scrollOffset,
        height: visibleRows,
      }),
    ]),
    detailFooter,
  ]);
}
