// Right-column event log aligned to quetz.pen.

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import { Scrollbar } from './Scrollbar.js';
import type { LogLine } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const HEADER_BG = rgb(15, 15, 15);
const CONTENT_BG = rgb(10, 10, 10);
const TITLE_BAR_ROWS = 2;

interface LogPanelProps {
  lines: LogLine[];
  scrollOffset: number;
  autoScroll: boolean;
  runMode: 'pr' | 'commit' | 'amend';
  width: number;
  height: number;
  key?: string;
}

export function LogPanel({ lines, scrollOffset, autoScroll, runMode, width, height }: LogPanelProps) {
  const visibleRows = Math.max(1, height - TITLE_BAR_ROWS);
  const maxOffset = Math.max(0, lines.length - visibleRows);
  const safeOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
  const visibleLines = autoScroll
    ? lines.slice(-visibleRows)
    : lines.slice(safeOffset, safeOffset + visibleRows);
  const effectiveScrollOffset = autoScroll
    ? maxOffset
    : safeOffset;

  const lineNodes = visibleLines.length > 0
    ? visibleLines.map((line, i) =>
        ui.text(`${line.icon} ${line.text}`, {
          key: String(i),
          style: { fg: fg(line.color) },
        })
      )
    : [ui.text('', {})];

  return ui.column({ width, height, style: { bg: CONTENT_BG } }, [
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
      [
        ui.row({ justify: 'between', width: 'full', items: 'center' }, [
          ui.text('quetz log', { style: { fg: fg(c.cyan) } }),
          ui.text(`mode: ${runMode}`, { style: { fg: fg(c.dim) } }),
        ]),
      ]
    ),
    ui.row({ id: 'log-scroll-region', flex: 1, height: 'full', width: 'full' }, [
      ui.column(
        { flex: 1, overflow: 'hidden', py: 0, px: 2, gap: 0, style: { bg: CONTENT_BG } },
        lineNodes
      ),
      Scrollbar({
        totalLines: lines.length,
        visibleLines: visibleRows,
        scrollOffset: effectiveScrollOffset,
        height: visibleRows,
      }),
    ]),
  ]);
}
