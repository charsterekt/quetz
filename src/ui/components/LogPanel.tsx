// LogPanel component — spec §7.6
// Right column bottom: quetz event log with scrollbar

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import { Scrollbar } from './Scrollbar.js';
import type { LogLine } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const HEADER_BG = rgb(15, 15, 15); // #0F0F0F
const CONTENT_BG = rgb(10, 10, 10); // #0A0A0A

// Title bar takes 2 rows (box + border)
const TITLE_BAR_ROWS = 2;

interface LogPanelProps {
  lines: LogLine[];
  scrollOffset: number;
  autoScroll: boolean;
  width: number;
  height: number;
  key?: string;
}

export function LogPanel({ lines, scrollOffset, autoScroll, width, height }: LogPanelProps) {
  const visibleRows = Math.max(1, height - TITLE_BAR_ROWS);

  const visibleLines = autoScroll
    ? lines.slice(-visibleRows)
    : lines.slice(scrollOffset, scrollOffset + visibleRows);

  const lineNodes = visibleLines.length > 0
    ? visibleLines.map((line, i) =>
        ui.text(`${line.icon}  ${line.text}`, {
          key: String(i),
          style: { fg: fg(line.color) },
        })
      )
    : [ui.text('', {})];

  const effectiveScrollOffset = autoScroll
    ? Math.max(0, lines.length - visibleRows)
    : scrollOffset;

  return ui.column(
    { width, height, style: { bg: CONTENT_BG } },
    [
      // Title bar
      ui.box(
        {
          border: 'single',
          borderTop: false,
          borderLeft: false,
          borderRight: false,
          borderBottom: true,
          borderStyle: { fg: fg(c.border) },
          style: { bg: HEADER_BG },
          px: 2,
          width: 'full',
        },
        [ui.text('quetz log', { style: { fg: fg(c.cyan) } })]
      ),

      // Content + scrollbar
      ui.row({ flex: 1, height: 'full', width: 'full' }, [
        ui.column(
          { flex: 1, overflow: 'hidden', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } },
          lineNodes
        ),
        Scrollbar({
          totalLines: lines.length,
          visibleLines: visibleRows,
          scrollOffset: effectiveScrollOffset,
          height: visibleRows,
        }),
      ]),
    ]
  );
}
