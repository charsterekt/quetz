// Right-column completed sessions list aligned to quetz.pen.

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { CompletedSession } from '../state.js';
import { Scrollbar } from './Scrollbar.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const HEADER_BG = rgb(15, 15, 15);
const CONTENT_BG = rgb(10, 10, 10);
const TITLE_BAR_ROWS = 2;

interface SessionsPanelProps {
  sessions: CompletedSession[];
  selectedIdx: number;
  isFocused: boolean;
  scrollOffset: number;
  width: number;
  height: number;
  key?: string;
}

export function SessionsPanel({ sessions, selectedIdx, isFocused, scrollOffset, width, height }: SessionsPanelProps) {
  const visibleRows = Math.max(1, height - TITLE_BAR_ROWS);
  const maxOffset = Math.max(0, sessions.length - visibleRows);
  const safeOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
  const visibleSessions = sessions.slice(safeOffset, safeOffset + visibleRows);

  const listContent =
    sessions.length === 0
      ? [ui.text('no completed sessions yet', { style: { fg: fg(c.dim) } })]
      : visibleSessions.map((session, i) => {
          const absoluteIdx = safeOffset + i;
          const isSelected = absoluteIdx === selectedIdx;
          const marker = isSelected ? '▶' : ' ';
          const rowColor = isSelected ? fg(c.brand) : fg(c.dim);
          const outcomeIcon = session.outcome === 'merged' ? '✓' : '✗';
          const outcomeColor = session.outcome === 'merged' ? fg(c.brand) : fg(c.error);

          return ui.row({ height: 1, gap: 1, key: session.id, items: 'center' }, [
            ui.text(marker, { style: { fg: isSelected ? fg(c.brand) : fg(c.dim) } }),
            ui.text(`${session.id}  ${session.title}`, { style: { fg: rowColor } }),
            ui.text(outcomeIcon, { style: { fg: isSelected ? fg(c.brand) : outcomeColor } }),
          ]);
        });

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
          ui.text('completed sessions', { style: { fg: fg(c.cyan) } }),
          ui.text('↑↓ enter esc', { style: { fg: fg(c.dim) } }),
        ]),
      ]
    ),
    ui.row({ id: 'sessions-scroll-region', flex: 1, height: 'full', width: 'full' }, [
      ui.column(
        { flex: 1, overflow: 'hidden', py: 0, px: 2, gap: 0, style: { bg: CONTENT_BG } },
        listContent as ReturnType<typeof ui.text>[]
      ),
      Scrollbar({
        totalLines: sessions.length,
        visibleLines: visibleRows,
        scrollOffset: safeOffset,
        height: visibleRows,
      }),
    ]),
  ]);
}
