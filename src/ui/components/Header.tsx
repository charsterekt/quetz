// Header component aligned to the current quetz.pen design.

import { defineWidget, ui, rgb, useInterval } from '@rezi-ui/core';
import { LOGO_LINES, LOGO_SUBTITLE } from '../logo.js';
import { c, hexToRgb } from '../theme.js';
import {
  SNAKE_FRAMES,
  snakeHead,
  dotsColor,
  counterColor,
  counterText,
  buildDots,
} from '../snake.js';
import type { ScreenMode } from '../state.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const headerBg = rgb(15, 15, 15);

interface HeaderProps {
  mode: ScreenMode;
  issueCount: { current: number; total: number };
  phase: string;
  bgStatus: string;
  key?: string;
}

export const Header = defineWidget<HeaderProps>((props, ctx) => {
  const { mode, issueCount, bgStatus } = props;
  const [frameIdx, setFrameIdx] = ctx.useState(0);

  useInterval(ctx, () => {
    if (mode === 'running' || mode === 'polling') {
      setFrameIdx((i: number) => (i + 1) % SNAKE_FRAMES.length);
    }
  }, 150);

  const frame = SNAKE_FRAMES[frameIdx % SNAKE_FRAMES.length];

  const logoCol = ui.column({ gap: 0 }, [
    ...LOGO_LINES.map((line, index) =>
      ui.text(line, { key: String(index), style: { fg: fg(c.logo) } })
    ),
    ui.text(LOGO_SUBTITLE, { style: { fg: fg(c.muted) } }),
  ]);

  const rightCol =
    mode === 'session_detail'
      ? ui.column({ items: 'end', gap: 1 }, [
          ui.text('[ viewing session ]', { style: { fg: fg(c.cyan) } }),
          ui.row({ gap: 1, items: 'center' }, [
            ui.box({ style: { bg: rgb(245, 158, 11) }, width: 1, height: 1 }),
            ui.text(bgStatus, { style: { fg: fg(c.accent) } }),
          ]),
        ])
      : ui.column({ items: 'end', gap: 1 }, [
          ui.row({ items: 'center' }, [
            ui.text(snakeHead(mode, frame), { style: { fg: fg(c.brand) } }),
            ...(mode === 'failure'
              ? [ui.text(' ✗', { style: { fg: fg(c.error), bold: true } })]
              : []),
            ui.text(buildDots(issueCount, mode), { style: { fg: fg(dotsColor(mode)) } }),
          ]),
          ui.text(counterText(issueCount, mode), {
            style: { fg: fg(counterColor(mode)), bold: true },
          }),
        ]);

  return ui.box(
    {
      border: 'single',
      borderTop: false,
      borderLeft: false,
      borderRight: false,
      borderBottom: true,
      borderStyle: { fg: fg(c.border) },
      style: { bg: headerBg },
      px: 2,
      py: 0,
      width: 'full',
    },
    [ui.row({ justify: 'between', width: 'full', items: 'center' }, [logoCol, rightCol])]
  );
});
