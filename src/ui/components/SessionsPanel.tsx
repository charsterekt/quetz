// SessionsPanel component — spec §7.5
// Right column top: completed sessions list with keyboard navigation

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import type { CompletedSession } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const HEADER_BG = rgb(15, 15, 15); // #0F0F0F
const CONTENT_BG = rgb(10, 10, 10); // #0A0A0A

interface SessionsPanelProps {
  sessions: CompletedSession[];
  selectedIdx: number;
  width: number;
  height: number;
  key?: string;
}

export function SessionsPanel({ sessions, selectedIdx, width, height }: SessionsPanelProps) {
  let listContent: ReturnType<typeof ui.text | typeof ui.row>[];

  if (sessions.length === 0) {
    listContent = [ui.text('no completed sessions yet', { style: { fg: fg(c.dim) } })];
  } else {
    listContent = sessions.map((session, i) => {
      const isSelected = i === selectedIdx;
      const icon = isSelected ? '▶' : ' ';
      const textColor = isSelected ? fg(c.brand) : fg(c.dim);
      const outcomeIcon = session.outcome === 'merged' ? '✓' : '✗';
      const outcomeColor = isSelected
        ? fg(c.brand)
        : session.outcome === 'merged' ? fg(c.brand) : fg(c.error);

      return ui.row({ height: 1, gap: 0, key: String(i) }, [
        ui.text(`${icon}  ${session.id}  ${session.title}  `, { style: { fg: textColor } }),
        ui.text(outcomeIcon, { style: { fg: outcomeColor } }),
      ]);
    });
  }

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
        [
          ui.row({ justify: 'between', width: 'full', items: 'center' }, [
            ui.text('completed sessions', { style: { fg: fg(c.cyan) } }),
            ui.text('↑↓ enter esc', { style: { fg: fg(c.dim) } }),
          ]),
        ]
      ),

      // Session list
      ui.column(
        { flex: 1, overflow: 'hidden', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } },
        listContent as ReturnType<typeof ui.text>[]
      ),
    ]
  );
}
