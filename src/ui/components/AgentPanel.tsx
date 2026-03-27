import { defineWidget, ui, rgb, useInterval } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import { Scrollbar } from './Scrollbar.js';
import type { AgentLine, SessionCompleteState } from '../state.js';
import type { QuetzPhase } from '../../events.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const HEADER_BG = rgb(15, 15, 15);
const CONTENT_BG = rgb(10, 10, 10);
const CHROME_ROWS = 8;

function toolLine(line: AgentLine): string {
  const name = (line.toolName ?? '').padEnd(5).slice(0, 5);
  return `▸ ${name}   ${line.content}`;
}

interface AgentPanelProps {
  phase: QuetzPhase;
  issueId: string;
  model: string;
  lines: AgentLine[];
  scrollOffset: number;
  autoScroll: boolean;
  sessionComplete: SessionCompleteState | null;
  viewportHeight: number;
  key?: string;
}

export const AgentPanel = defineWidget<AgentPanelProps>((props, ctx) => {
  const { phase, issueId, model, lines, scrollOffset, autoScroll, sessionComplete, viewportHeight } = props;
  const [spinnerIdx, setSpinnerIdx] = ctx.useState(0);

  useInterval(ctx, () => {
    if (phase === 'pr_polling') {
      setSpinnerIdx((i: number) => (i + 1) % SPINNER_FRAMES.length);
    }
  }, 300);

  const agentHeaderText = sessionComplete
    ? `agent: ${issueId}  |  session complete`
    : `agent: ${issueId}  |  ${model}  [running]`;
  const visibleRows = Math.max(1, viewportHeight - CHROME_ROWS);

  let content: ReturnType<typeof ui.column>;

  if (sessionComplete) {
    const prText = sessionComplete.prNumber
      ? `✓ pr #${sessionComplete.prNumber} found`
      : '✓ session complete';
    const spin = SPINNER_FRAMES[spinnerIdx];

    content = ui.column({ flex: 1, height: 'full', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } }, [
      ui.text('──── agent session complete ────', { style: { fg: fg(c.muted) } }),
      ui.text(prText, { style: { fg: fg(c.brand) } }),
      ui.text(`⏳ waiting for merge...  ${spin}  (${sessionComplete.elapsed})`, { style: { fg: fg(c.accent) } }),
    ]);
  } else {
    const visibleLines = autoScroll
      ? lines.slice(-visibleRows)
      : lines.slice(scrollOffset, scrollOffset + visibleRows);

    const lineNodes = visibleLines.map((line, i) =>
      ui.text(line.type === 'tool' ? toolLine(line) : line.content, {
        key: String(i),
        style: { fg: line.type === 'tool' ? fg(c.cyan) : fg(c.text) },
      })
    );

    content = ui.column(
      { flex: 1, height: 'full', overflow: 'hidden', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } },
      lineNodes.length > 0 ? lineNodes : [ui.text('', {})]
    );
  }

  return ui.column({ flex: 1, height: 'full', style: { bg: CONTENT_BG } }, [
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
      [ui.text(agentHeaderText, { style: { fg: fg(c.agent) } })]
    ),
    ui.row({ flex: 1, height: 'full', width: 'full' }, [
      content,
      Scrollbar({
        totalLines: lines.length,
        visibleLines: visibleRows,
        scrollOffset: autoScroll ? Math.max(0, lines.length - visibleRows) : scrollOffset,
        height: visibleRows,
      }),
    ]),
  ]);
});
