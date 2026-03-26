// Header component — spec §7.1
// Block-pixel logo + animated snake + counter (or session context for session_detail mode)

import { ui, rgb, defineWidget, useInterval } from '@rezi-ui/core';
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

const headerBg = rgb(15, 15, 15); // #0F0F0F

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

  // Left column: logo + subtitle
  const logoCol = ui.column({ pt: 2 }, [
    ...LOGO_LINES.map(line =>
      ui.text(line, { style: { fg: fg(c.logo) } })
    ),
    ui.text(LOGO_SUBTITLE, { style: { fg: fg(c.muted) } }),
  ]);

  // Right column: session_detail vs snake+counter
  const rightCol =
    mode === 'session_detail'
      ? ui.column({ items: 'end', gap: 1 }, [
          ui.text('[ viewing session ]', { style: { fg: fg(c.cyan) } }),
          ui.row({ gap: 1, items: 'center' }, [
            ui.box({ style: { bg: fg(c.accent) }, width: 1, height: 1 }),
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
      width: 'full',
    },
    [
      ui.row({ justify: 'between', width: 'full', items: 'center' }, [
        logoCol,
        rightCol,
      ]),
    ]
  );
});
