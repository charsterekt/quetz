// Right-column completed sessions list aligned to quetz.pen.

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { CompletedSession } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const HEADER_BG = rgb(15, 15, 15);
const CONTENT_BG = rgb(10, 10, 10);

interface SessionsPanelProps {
  sessions: CompletedSession[];
  selectedIdx: number;
  isFocused: boolean;
  width: number;
  height: number;
  key?: string;
}

export function SessionsPanel({ sessions, selectedIdx, isFocused, width, height }: SessionsPanelProps) {
  const listContent =
    sessions.length === 0
      ? [ui.text('no completed sessions yet', { style: { fg: fg(c.dim) } })]
      : sessions.map((session, i) => {
          const isSelected = i === selectedIdx;
          const marker = isSelected ? '▶' : ' ';
          const rowColor = isSelected ? fg(c.brand) : fg(c.dim);
          const outcomeIcon = session.outcome === 'merged' ? '✓' : '✗';
          const outcomeColor = session.outcome === 'merged' ? fg(c.brand) : fg(c.error);

          return ui.row({ height: 1, gap: 1, key: String(i), items: 'center' }, [
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
          ui.text('completed sessions', { style: { fg: isFocused ? fg(c.brand) : fg(c.cyan) } }),
          ui.text('↑↓ enter esc', { style: { fg: fg(c.dim) } }),
        ]),
      ]
    ),
    ui.column(
      { flex: 1, overflow: 'hidden', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } },
      listContent as ReturnType<typeof ui.text>[]
    ),
  ]);
}
